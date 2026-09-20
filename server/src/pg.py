#

from datetime import timezone, datetime
from dataclasses import dataclass
from pathlib import Path
import psycopg
from psycopg.rows import dict_row
from typing import Dict, List, Optional
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
        moods: Optional[Dict[str, float]] = None,
        mood_vector: Optional[List[float]] = None,
        moods_normalized: Optional[Dict[str, float]] = None,
        mood_vector_normalized: Optional[List[float]] = None,
    ) -> None:
        # Format JSONB strings
        moods_json = json.dumps(moods) if moods is not None else None
        moods_norm_json = (
            json.dumps(moods_normalized) if moods_normalized is not None else None
        )

        # Format vector strings
        mood_vec_str = (
            f"[{','.join(f'{x:.6f}' for x in mood_vector)}]"
            if mood_vector is not None
            else None
        )
        mood_norm_vec_str = (
            f"[{','.join(f'{x:.6f}' for x in mood_vector_normalized)}]"
            if mood_vector_normalized is not None
            else None
        )

        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO nodes (
                    filepath, 
                    musical_embedding, 
                    moods, 
                    mood_vector,
                    moods_normalized,
                    mood_vector_normalized,
                    updated_at
                )
                VALUES (%s, %s, %s, %s::vector, %s, %s::vector, NOW())
                ON CONFLICT (filepath) DO UPDATE SET
                    musical_embedding = EXCLUDED.musical_embedding,
                    moods = EXCLUDED.moods,
                    mood_vector = EXCLUDED.mood_vector,
                    moods_normalized = EXCLUDED.moods_normalized,
                    mood_vector_normalized = EXCLUDED.mood_vector_normalized,
                    updated_at = NOW();
                """,
                (
                    filepath,
                    embedding,
                    moods_json,
                    mood_vec_str,
                    moods_norm_json,
                    mood_norm_vec_str,
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

    def get_track_path_by_id(self, track_id):
        print('getting', track_id)
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


_pg_instance = None


def get_pg():
    global _pg_instance

    if _pg_instance is None:
        _pg_instance = PostgresStore()

    return _pg_instance
