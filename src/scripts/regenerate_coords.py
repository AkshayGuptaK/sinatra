from pathlib import Path
import joblib
import numpy as np
from src.config import config
from src.pg import get_pg

BATCH_SIZE = 100


def get_projector_path() -> Path:
    project_root = config["project_root"]
    return project_root / "src" / "models" / "projector" / "mood_projector_kr.joblib"


def generate_library_coords():
    model_path = get_projector_path()
    if not model_path.exists():
        raise FileNotFoundError(
            f"Projector model not found at: {model_path}. "
            "Run your t-SNE / Kernel Ridge projection script first."
        )

    print(f"Loading 2D mapper from {model_path}...")
    checkpoint = joblib.load(model_path)
    kr_model = checkpoint["model"]
    emotion_cols = checkpoint["emotion_cols"]

    db = get_pg()

    # Query all tracks having mood values, ignoring any existing coordinates
    print("Fetching library tracks from database...")
    with db.conn.cursor() as cur:
        cur.execute(
            """
            SELECT filepath, moods
            FROM nodes
            WHERE moods IS NOT NULL;
            """
        )
        rows = cur.fetchall()

    total_tracks = len(rows)
    print(f"Found {total_tracks} tracks to project.")
    if total_tracks == 0:
        print("No tracks with mood scores found in `nodes`.")
        return

    update_payloads = []
    processed = 0

    for filepath, moods_data in rows:
        # Build 24D input vector in the exact order expected by the model
        if isinstance(moods_data, dict):
            vec_24 = [float(moods_data.get(mood, 0.0)) for mood in emotion_cols]
        else:
            continue

        X = np.array([vec_24], dtype=np.float64)

        # Predict 2D coordinates: shape (1, 2) -> (x, y)
        preds = kr_model.predict(X)[0]
        coord_x = float(preds[0])
        coord_y = float(preds[1])

        update_payloads.append((coord_x, coord_y, filepath))

        if len(update_payloads) >= BATCH_SIZE:
            _flush_batch(db, update_payloads)
            processed += len(update_payloads)
            print(f"Updated {processed}/{total_tracks} tracks...", end="\r", flush=True)
            update_payloads = []

    if update_payloads:
        _flush_batch(db, update_payloads)
        processed += len(update_payloads)
        print(f"Updated {processed}/{total_tracks} tracks.")

    print(f"\nCoordinate generation complete across {processed} tracks.")


def _flush_batch(db, batch_data):
    with db.conn.cursor() as cur:
        cur.executemany(
            """
            UPDATE nodes
            SET coord_x = %s,
                coord_y = %s,
                updated_at = NOW()
            WHERE filepath = %s;
            """,
            batch_data,
        )
    db.conn.commit()


if __name__ == "__main__":
    generate_library_coords()