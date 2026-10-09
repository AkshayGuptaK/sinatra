# src/scripts/compare_test_embeddings.py
import argparse
from typing import Dict, List
import numpy as np
import pandas as pd
from sklearn.linear_model import RidgeCV
from sklearn.metrics import r2_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.preprocessing import StandardScaler

from src.pg import get_pg

LAYERS = [
    "mert_v1",
    "mert_v2_l14_instrument",
    "mert_v2_l16_mood",
    "mert_v2_l19_genre",
    "mert_v2_l23_genre",
    "mert_v2_l24_final",
]


def parse_vector(raw_vec) -> np.ndarray:
    if isinstance(raw_vec, str):
        cleaned = raw_vec.strip("[]").split(",")
        return np.array([float(x) for x in cleaned], dtype=np.float32)
    return np.asarray(raw_vec, dtype=np.float32)


def run_test_embedding_comparison(min_samples: int = 15):
    db = get_pg()

    # Join test_embeddings with nodes to pull corresponding ground truth moods
    query = """
        SELECT 
            t.filepath,
            n.mood,
            t.mert_v1,
            t.mert_v2_l14_instrument,
            t.mert_v2_l16_mood,
            t.mert_v2_l19_genre,
            t.mert_v2_l23_genre,
            t.mert_v2_l24_final
        FROM test_embeddings t
        JOIN nodes n ON t.filepath = n.filepath
        WHERE n.mood IS NOT NULL 
          AND TRIM(n.mood) != ''
          AND t.mert_v2_l24_final IS NOT NULL;
    """

    print("Fetching tracks from `test_embeddings` matched with `nodes.mood`...")
    with db.conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()

    if not rows:
        print("❌ No matching labeled tracks found in `test_embeddings`.")
        return

    print(f"Loaded {len(rows)} matching tracks.\n")

    # 1. Parse into arrays
    moods_list = []
    layer_matrices: Dict[str, List[np.ndarray]] = {col: [] for col in LAYERS}

    for row in rows:
        mood = row[1].strip().lower()
        # Row layout: 0=filepath, 1=mood, 2..7=embeddings
        embs = [parse_vector(r) for r in row[2:8]]

        # Ensure all columns decoded to length 1024
        if any(e.shape[0] != 1024 for e in embs):
            continue

        moods_list.append(mood)
        for i, col in enumerate(LAYERS):
            layer_matrices[col].append(embs[i])

    mood_series = pd.Series(moods_list)
    counts = mood_series.value_counts()
    eligible_moods = counts[counts >= min_samples].index.tolist()

    if not eligible_moods:
        print(f"❌ No categories with >= {min_samples} samples. Use `--min-samples`.")
        return

    print(f"Found {len(eligible_moods)} categories meeting the sample threshold:\n")

    # 2. Fit RidgeCV per layer
    alphas = np.logspace(-2, 4, 30)
    scaler = StandardScaler()
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    # DataFrame to collect results
    summary_results: Dict[str, Dict[str, float]] = {col: {} for col in LAYERS}

    for col in LAYERS:
        print(f"Evaluating: {col}...", flush=True)
        X_raw = np.vstack(layer_matrices[col])
        X_scaled = scaler.fit_transform(X_raw)

        for mood in eligible_moods:
            y = (mood_series == mood).astype(np.float32).values
            model = RidgeCV(alphas=alphas)
            y_pred = cross_val_predict(model, X_scaled, y, cv=cv.split(X_scaled, y))
            r2 = r2_score(y, y_pred)
            summary_results[col][mood] = r2

    comp_df = pd.DataFrame(summary_results)

    # Calculate Mean R² row
    mean_row = comp_df.mean(axis=0)
    mean_row.name = "== MEAN R² =="
    display_df = pd.concat([comp_df, pd.DataFrame([mean_row])])

    # 3. Format Output Table
    col_w = 16
    header = f"{'Fruit / Mood':<20} | " + " | ".join(
        f"{c:>{col_w}}" for c in display_df.columns
    )
    sep = "-" * len(header)

    print("\n" + "=" * len(header))
    print("📊 TEST_EMBEDDINGS LAYER R² COMPARISON MATRIX")
    print("=" * len(header))
    print(header)
    print(sep)

    for mood, row in display_df.iterrows():
        row_str = " | ".join(f"{val:>+{col_w}.4f}" for val in row)
        if mood == "== MEAN R² ==":
            print(sep)
            print(f"\033[1m{mood:<20}\033[0m | {row_str}")
        else:
            print(f"{mood.title():<20} | {row_str}")

    print("=" * len(header) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="One-off probe on test_embeddings layers"
    )
    parser.add_argument(
        "--min-samples",
        type=int,
        default=15,
        help="Minimum number of samples required per category (default: 15)",
    )
    args = parser.parse_args()
    run_test_embedding_comparison(min_samples=args.min_samples)
