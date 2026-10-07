import argparse
from typing import List, Optional
import numpy as np
import pandas as pd
from sklearn.linear_model import RidgeCV
from sklearn.metrics import mean_squared_error, r2_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.preprocessing import StandardScaler

from src.pg import get_pg


def parse_vector(raw_vec) -> np.ndarray:
    """Parses a pgvector string or array into a float32 numpy array."""
    if isinstance(raw_vec, str):
        cleaned = raw_vec.strip("[]").split(",")
        return np.array([float(x) for x in cleaned], dtype=np.float32)
    return np.asarray(raw_vec, dtype=np.float32)


def test_predict_tag(X_mert: np.ndarray, y_tag: np.ndarray, tag_name: str):
    """Can MERT-v2 predict the presence of a tag itself?"""
    print("\n" + "=" * 80)
    print(f"🎯 THEORY: CAN MERT-v2 PREDICT THE '{tag_name.upper()}' TAG?")
    print("=" * 80)

    n_pos = int(y_tag.sum())
    n_total = len(y_tag)
    print(f"Positive samples: {n_pos}/{n_total} ({n_pos / n_total * 100:.1f}%)")

    if n_pos < 10:
        print(f"❌ Not enough positive samples for tag '{tag_name}' to run regression.")
        return

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_mert)

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    alphas = np.logspace(-2, 4, 30)

    model = RidgeCV(alphas=alphas)
    y_pred = cross_val_predict(model, X_scaled, y_tag, cv=cv.split(X_scaled, y_tag))

    r2 = r2_score(y_tag, y_pred)
    rmse = np.sqrt(mean_squared_error(y_tag, y_pred))
    auc = roc_auc_score(y_tag, y_pred)

    model.fit(X_scaled, y_tag)
    best_alpha = getattr(model, "alpha_", None)

    print(f"\nLinear R² (Variance Explained):   {r2:+.4f}")
    print(f"ROC-AUC  (Ranking Separation):    {auc:.4f}")
    print(f"RMSE:                             {rmse:.4f}")
    if best_alpha:
        print(f"Optimal Alpha (Regularization):  {best_alpha:.2f}")

    print("\nConclusion:")
    if auc >= 0.90 or r2 >= 0.50:
        print(
            f"✅ Confirmed: MERT-v2 strongly encodes '{tag_name}'. The tag provides little "
            "new signal because the neural representation already captured it."
        )
    elif auc >= 0.75:
        print(
            f"⚠️ Moderate signal: MERT-v2 partially tracks '{tag_name}', but misses edge cases."
        )
    else:
        print(f"❌ Failure: MERT-v2 is blind to '{tag_name}'.")
    print("=" * 80 + "\n")


def run_mood_regression(
    min_samples: int = 15,
    tag_filter: str = "instrumental",
    mode: str = "all",
):
    db = get_pg()

    query = """
        SELECT 
            id::text,
            COALESCE(title, filepath) AS title,
            mood,
            musical_embedding,
            tags
        FROM nodes
        WHERE musical_embedding IS NOT NULL
          AND mood IS NOT NULL
          AND TRIM(mood) != '';
    """

    print("Fetching tracks with MERT embeddings, moods, and tags from PostgreSQL...")
    with db.conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()

    if not rows:
        print("❌ No labeled tracks with `musical_embedding` found in nodes.")
        return

    print(f"Loaded {len(rows)} labeled songs.")

    clean_tag = tag_filter.strip().lower()

    data = []
    vectors = []
    tag_flags = []

    for row in rows:
        track_id, title, mood, emb, raw_tags = row[0], row[1], row[2], row[3], row[4]
        vec = parse_vector(emb)
        if vec.shape[0] != 1024:
            continue

        if isinstance(raw_tags, list):
            tag_list = [str(t).strip().lower() for t in raw_tags]
        elif isinstance(raw_tags, str):
            tag_list = [t.strip().lower() for t in raw_tags.strip("{}[]").split(",")]
        else:
            tag_list = []

        is_tagged = 1.0 if clean_tag in tag_list else 0.0

        data.append(
            {
                "id": track_id,
                "title": title,
                "mood": mood.strip().lower(),
                "has_tag": is_tagged,
            }
        )
        vectors.append(vec)
        tag_flags.append(is_tagged)

    df = pd.DataFrame(data)
    X_mert = np.vstack(vectors)
    y_tag = np.array(tag_flags, dtype=np.float32)

    # Mode 1: Directly test if MERT predicts the tag
    if mode == "predict-tag":
        test_predict_tag(X_mert, y_tag, clean_tag)
        return

    # Filter out rare moods
    mood_counts = df["mood"].value_counts()
    eligible_moods = mood_counts[mood_counts >= min_samples].index.tolist()

    print(f"Total unique moods: {len(mood_counts)}")
    print(f"Eligible moods (>= {min_samples} songs): {len(eligible_moods)}")
    print(f"Tagged '{clean_tag}': {int(y_tag.sum())}/{len(df)} tracks\n")

    if not eligible_moods:
        print(f"❌ No moods meet the minimum sample threshold of {min_samples}.")
        return

    # Feature matrices
    scaler = StandardScaler()
    X_mert_scaled = scaler.fit_transform(X_mert)

    tag_col = y_tag.reshape(-1, 1)
    tag_col_scaled = scaler.fit_transform(tag_col)

    X_augmented = scaler.fit_transform(np.hstack([X_mert, tag_col]))

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    alphas = np.logspace(-2, 4, 30)

    # Format header
    if mode == "all":
        header = (
            f"{'Fruit / Mood':<18} | {'Count':<5} | {'Base MERT':<9} | "
            f"{'Tag Alone':<9} | {'Augmented':<9} | {'Δ R²':<7} | {'MERT AUC':<8}"
        )
    elif mode == "tag-only":
        header = (
            f"{'Fruit / Mood':<18} | {'Count':<5} | {'Tag Alone R²':<12} | {'AUC':<8}"
        )
    else:  # mert-only
        header = f"{'Fruit / Mood':<18} | {'Count':<5} | {'MERT R²':<10} | {'AUC':<8}"

    print("=" * len(header))
    print(header)
    print("=" * len(header))

    results = []

    for mood in eligible_moods:
        y = (df["mood"] == mood).astype(np.float32).values
        n_pos = int(y.sum())
        splits = cv.split(X_mert, y)

        r2_base, auc_base, r2_tag_only, r2_aug, delta = 0.0, 0.5, 0.0, 0.0, 0.0

        # 1. Baseline MERT
        if mode in ("all", "mert-only"):
            model_base = RidgeCV(alphas=alphas)
            y_pred_base = cross_val_predict(
                model_base, X_mert_scaled, y, cv=cv.split(X_mert_scaled, y)
            )
            r2_base = r2_score(y, y_pred_base)
            auc_base = roc_auc_score(y, y_pred_base) if len(np.unique(y)) > 1 else 0.50

        # 2. Tag Alone (Theory 2)
        if mode in ("all", "tag-only"):
            model_tag_only = RidgeCV(alphas=alphas)
            y_pred_tag = cross_val_predict(
                model_tag_only, tag_col_scaled, y, cv=cv.split(tag_col_scaled, y)
            )
            r2_tag_only = r2_score(y, y_pred_tag)
            auc_tag = roc_auc_score(y, y_pred_tag) if len(np.unique(y)) > 1 else 0.50

        # 3. Augmented (MERT + Tag)
        if mode == "all":
            model_aug = RidgeCV(alphas=alphas)
            y_pred_aug = cross_val_predict(
                model_aug, X_augmented, y, cv=cv.split(X_augmented, y)
            )
            r2_aug = r2_score(y, y_pred_aug)
            delta = r2_aug - r2_base

        # Print per mode
        if mode == "all":
            print(
                f"{mood.title():<18} | {n_pos:<5} | {r2_base:>+8.4f}  | "
                f"{r2_tag_only:>+8.4f}  | {r2_aug:>+8.4f}  | {delta:>+6.4f} | {auc_base:>7.3f}"
            )
        elif mode == "tag-only":
            print(
                f"{mood.title():<18} | {n_pos:<5} | {r2_tag_only:>+11.4f}  | {auc_tag:>7.3f}"
            )
        else:
            print(
                f"{mood.title():<18} | {n_pos:<5} | {r2_base:>+9.4f}  | {auc_base:>7.3f}"
            )

        results.append(
            {
                "mood": mood,
                "count": n_pos,
                "r2_mert": r2_base,
                "r2_tag_only": r2_tag_only,
                "r2_augmented": r2_aug,
                "delta_r2": delta,
                "auc": auc_base if mode != "tag-only" else auc_tag,
            }
        )

    print("=" * len(header))

    if mode == "all":
        res_df = pd.DataFrame(results)
        print(f"\nMean R² Baseline MERT: {res_df['r2_mert'].mean():+.4f}")
        print(f"Mean R² Tag Alone:     {res_df['r2_tag_only'].mean():+.4f}")
        print(f"Mean R² Augmented:     {res_df['r2_augmented'].mean():+.4f}")
        print(f"Average Δ R²:          {res_df['delta_r2'].mean():+.4f}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Evaluate MERT-v2 and Tag predictive power on moods"
    )
    parser.add_argument(
        "--mode",
        choices=["all", "predict-tag", "tag-only", "mert-only"],
        default="all",
        help="Evaluation mode: 'all' (comparison matrix), 'predict-tag' (Theory 1), 'tag-only' (Theory 2), or 'mert-only'.",
    )
    parser.add_argument(
        "--tag",
        type=str,
        default="instrumental",
        help="Tag to inspect/condition on (default: 'instrumental').",
    )
    parser.add_argument(
        "--min-samples",
        type=int,
        default=15,
        help="Minimum number of tracks required for a mood category.",
    )
    args = parser.parse_args()

    run_mood_regression(
        min_samples=args.min_samples,
        tag_filter=args.tag,
        mode=args.mode,
    )
