#

from datetime import timezone, datetime
from dataclasses import dataclass
from pathlib import Path
import psycopg
from psycopg.rows import dict_row
from typing import Dict, List, Optional, Any
import json
from src.config import config


@dataclass(frozen=True)
class FileStat:
    location: str
    last_indexed_at: datetime


class PostgresStore:
    def __init__(self):
        self.conn = psycopg.connect(config["postgres_dsn"])
        self._migrate()

    def _migrate(self):
        with self.conn.cursor() as cur:
            cur.execute(
                """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                filename TEXT UNIQUE NOT NULL,
                migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
            )
        self.conn.commit()

        with self.conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT filename FROM schema_migrations")
            applied_migrations = {row["filename"] for row in cur.fetchall()}

            for file in sorted(Path("./src/migrations").glob("*.sql")):
                if file.name in applied_migrations:
                    continue

                sql = file.read_text()
                print(f"Applying migration {file.name}", flush=True)
                cur.execute(sql)
                cur.execute(
                    "INSERT INTO schema_migrations (filename) VALUES (%s)",
                    (file.name,),
                )
                self.conn.commit()

    def upsert_track(
        self,
        filepath: str,
        embedding: List[float],
        emotions: Optional[Dict[str, float]] = None,
        emotion_vector: Optional[List[float]] = None,
        emotions_normalized: Optional[Dict[str, float]] = None,
        emotion_vector_normalized: Optional[List[float]] = None,
    ) -> None:
        # Format JSONB strings
        emotions_json = json.dumps(emotions) if emotions is not None else None
        emotions_norm_json = (
            json.dumps(emotions_normalized) if emotions_normalized is not None else None
        )

        # Format vector strings
        emotion_vec_str = (
            f"[{','.join(f'{x:.6f}' for x in emotion_vector)}]"
            if emotion_vector is not None
            else None
        )
        emotion_norm_vec_str = (
            f"[{','.join(f'{x:.6f}' for x in emotion_vector_normalized)}]"
            if emotion_vector_normalized is not None
            else None
        )

        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO nodes (
                    filepath, 
                    musical_embedding, 
                    emotions, 
                    emotion_vector,
                    emotions_normalized,
                    emotion_vector_normalized,
                    updated_at
                )
                VALUES (%s, %s, %s, %s::vector, %s, %s::vector, NOW())
                ON CONFLICT (filepath) DO UPDATE SET
                    musical_embedding = EXCLUDED.musical_embedding,
                    emotions = EXCLUDED.emotions,
                    emotion_vector = EXCLUDED.emotion_vector,
                    emotions_normalized = EXCLUDED.emotions_normalized,
                    emotion_vector_normalized = EXCLUDED.emotion_vector_normalized,
                    updated_at = NOW();
                """,
                (
                    filepath,
                    embedding,
                    emotions_json,
                    emotion_vec_str,
                    emotions_norm_json,
                    emotion_norm_vec_str,
                ),
            )

        self.conn.commit()

    def delete_by_filenames(self, filenames):
        with self.conn.cursor() as cur:
            cur.execute(
                """
               DELETE FROM nodes WHERE filepath = ANY(%s)
                """,
                (list(filenames),),
            )

        self.conn.commit()

    def get_file_stats(self):
        with self.conn.cursor() as cur:
            cur.execute(
                """
               SELECT filepath, updated_at FROM nodes
                """,
            )
            return [
                FileStat(location=fname, last_indexed_at=ts.astimezone(timezone.utc))
                for fname, ts in cur.fetchall()
            ]

    def get_all_tracks(self):
        query = """
        SELECT id::text,
               title,
               artist,
               album,
               mood,
               tags,
               duration,
               emotions_normalized,
               coord_x,
               coord_y
        FROM nodes
        ORDER BY title ASC
        """
        try:
            with self.conn.cursor() as cur:
                cur.execute(query)
                result = cur.fetchall()
                tracks = [
                    {
                        "id": r[0],
                        "title": r[1] or "Unknown Title",
                        "artist": r[2] or "Unknown Artist",
                        "album": r[3] or "",
                        "mood": r[4] or "",
                        "tags": r[5] or [],
                        "duration": float(r[6]),
                        "emotions": r[7] or {},
                        "coord_x": r[8] or 0,
                        "coord_y": r[9] or 0,
                    }
                    for r in result
                ]
            return tracks
        except Exception as e:
            print(f"Error loading tracks: {e}")
            return None

    def get_track_path_by_id(self, track_id):
        query = """
        SELECT filepath FROM nodes WHERE id = %s;
        """
        try:
            with self.conn.cursor() as cur:
                cur.execute(query, ([track_id]))
                result = cur.fetchone()
                return result[0] if result else None
        except Exception as e:
            print(f"Error finding track: {e}")
            return None

    def get_similar_track(self, current_filepath):
        query = """
        SELECT filepath 
        FROM nodes 
        WHERE filepath != %s
        ORDER BY musical_embedding <=> (
            SELECT musical_embedding FROM nodes WHERE filepath = %s
        ) ASC
        LIMIT 1;
        """
        try:
            with self.conn.cursor() as cur:
                cur.execute(query, (current_filepath, current_filepath))
                result = cur.fetchone()
                return result[0] if result else None
        except Exception as e:
            print(f"Error finding similar track: {e}")
            return None

    def get_similar_tracks_except_excluded(
        self,
        track_id: str,
        excluded_ids: Optional[List[str]] = None,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """Returns top similar tracks by cosine distance on musical_embedding,
        excluding tracks in excluded_ids and the target track itself.
        """
        excluded_list = list(excluded_ids or [])
        excluded_list.append(track_id)

        query = """
        WITH target AS (
            SELECT musical_embedding
            FROM nodes
            WHERE id = %s::uuid
        )
        SELECT n.id::text,
               n.title AS title,
               n.artist AS artist,
               n.album AS album,
               n.mood AS mood,
               n.tags AS tags,
               n.duration AS duration,
               ROUND((n.musical_embedding <=> t.musical_embedding)::numeric, 4) AS distance
        FROM nodes n, target t
        WHERE n.musical_embedding IS NOT NULL
          AND t.musical_embedding IS NOT NULL
          AND NOT (n.id = ANY(%s::uuid[]))
        ORDER BY n.musical_embedding <=> t.musical_embedding ASC
        LIMIT %s;
        """

        try:
            with self.conn.cursor() as cur:
                cur.execute(query, (track_id, excluded_list, limit))
                rows = cur.fetchall()

                return [
                    {
                        "id": r[0],
                        "title": r[1] or "Unknown Title",
                        "artist": r[2] or "Unknown Artist",
                        "album": r[3] or "",
                        "mood": r[4] or "",
                        "tags": r[5] or "",
                        "duration": float(r[6]),
                    }
                    for r in rows
                ]
        except Exception as e:
            print(f"Error finding similar tracks: {e}")
            return []

    def filter_by_metadata(self, metadata_field, metadata_value):
        with self.conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"""
            SELECT filepath
            FROM nodes
            WHERE {metadata_field} = %(val)s;
            """,
                {"val": metadata_value},
            )
            return [row["filepath"] for row in cur.fetchall()]

    def update_track_metadata(self, track_id: str, fields: Dict[str, Any]) -> bool:
        """Updates editable metadata fields (title, artist, album, mood, tags) for a track."""
        allowed_fields = {
            "title": "title",
            "artist": "artist",
            "album": "album",
            "mood": "mood",
            "tags": "tags",
        }

        updates = []
        values = []

        for key, val in fields.items():
            if key in allowed_fields:
                col_name = allowed_fields[key]
                updates.append(f"{col_name} = %s")

                if col_name == "tags":
                    values.append(list(val) if val is not None else [])
                else:
                    values.append(val if val is not None else "")

        if not updates:
            return False

        updates.append("updated_at = NOW()")
        values.append(track_id)

        query = f"""
            UPDATE nodes
            SET {', '.join(updates)}
            WHERE id = %s::uuid;
        """

        try:
            with self.conn.cursor() as cur:
                cur.execute(query, tuple(values))
            self.conn.commit()
            return True
        except Exception as e:
            print(f"Error updating track {track_id}: {e}")
            self.conn.rollback()
            return False


_pg_instance = None


def get_pg():
    global _pg_instance

    if _pg_instance is None:
        _pg_instance = PostgresStore()

    return _pg_instance
