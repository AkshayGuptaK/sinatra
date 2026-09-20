import argparse
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.neighbors import NearestNeighbors
from src.config import config
from src.pg import get_pg

BATCH_SIZE = 100


def get_projector_path() -> Path:
    project_root = config["project_root"]
    return project_root / "src" / "models" / "projector" / "mood_projector_kr.joblib"


def get_cowen_coords_path() -> Path:
    project_root = config["project_root"]
    return project_root / "datasets" / "cowen_2d_coords.csv"


def generate_library_coords(method: str = "kr", k: int = 5):
    print(f"Initializing 2D coordinate projection using method: [{method.upper()}]")

    # 1. Setup projection models based on selected method
    if method == "knn":
        cowen_coords_path = get_cowen_coords_path()
        if not cowen_coords_path.exists():
            raise FileNotFoundError(
                f"Cowen reference coordinates not found at: {cowen_coords_path}. "
                "Run your Cowen projection export script first."
            )

        print(f"Loading Cowen reference manifold from {cowen_coords_path}...")
        cowen_df = pd.read_csv(cowen_coords_path)

        # Detect emotion columns (all non-metadata columns)
        metadata_cols = {"row_id", "filename", "map_x", "map_y", "dominant_emotion"}
        emotion_cols = [c for c in cowen_df.columns if c not in metadata_cols]

        X_ref = cowen_df[emotion_cols].to_numpy(dtype=np.float64)
        Y_ref = cowen_df[["map_x", "map_y"]].to_numpy(dtype=np.float64)

        print(f"Fitting KNN (k={k}, metric='correlation') on {len(cowen_df)} anchor points...")
        knn = NearestNeighbors(n_neighbors=k, metric="correlation")
        knn.fit(X_ref)

        def project_coords(X_input: np.ndarray) -> np.ndarray:
            distances, indices = knn.kneighbors(X_input)
            # Add epsilon to prevent divide-by-zero on exact distance matches
            weights = 1.0 / (distances + 1e-6)
            weights /= np.sum(weights, axis=1, keepdims=True)

            # Barycentric combination: shape (N, 2)
            coords_batch = np.sum(
                Y_ref[indices] * weights[:, :, np.newaxis], axis=1
            )
            return coords_batch

    else:
        # Default: Kernel Ridge
        model_path = get_projector_path()
        if not model_path.exists():
            raise FileNotFoundError(
                f"Projector model not found at: {model_path}. "
                "Run your t-SNE / Kernel Ridge projection script first."
            )

        print(f"Loading Kernel Ridge mapper from {model_path}...")
        checkpoint = joblib.load(model_path)
        kr_model = checkpoint["model"]
        emotion_cols = checkpoint["emotion_cols"]

        def project_coords(X_input: np.ndarray) -> np.ndarray:
            return kr_model.predict(X_input)

    # 2. Fetch tracks from database
    db = get_pg()
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

    # 3. Process and batch update coordinates
    for filepath, moods_data in rows:
        if not isinstance(moods_data, dict):
            continue

        vec_24 = [float(moods_data.get(mood, 0.0)) for mood in emotion_cols]
        X = np.array([vec_24], dtype=np.float64)

        preds = project_coords(X)[0]
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

    print(f"\nCoordinate generation ({method.upper()}) complete across {processed} tracks.")


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
    parser = argparse.ArgumentParser(
        description="Generate 2D manifold coordinates for library tracks."
    )
    parser.add_argument(
        "method",
        nargs="?",
        default="kr",
        choices=["kr", "knn"],
        help="Projection method: 'kr' (Kernel Ridge) or 'knn' (k-NN Barycentric). Defaults to 'kr'.",
    )
    parser.add_argument(
        "--k",
        type=int,
        default=5,
        help="Number of nearest neighbors to average if using knn mode. Defaults to 5.",
    )

    args = parser.parse_args()
    generate_library_coords(method=args.method, k=args.k)