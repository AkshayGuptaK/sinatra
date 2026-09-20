from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.linear_model import RidgeCV
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.model_selection import KFold, cross_val_predict
from sklearn.preprocessing import StandardScaler
from src.config import config

MERT_CSV = config["project_root"] / "datasets" / "cowen_mert_embeddings.csv"
WEIGHTS_CSV = config["project_root"] / "datasets" / "cowen_mert_regression_weights.csv"
OUTPUT_CSV = config["project_root"] / "datasets" / "cowen_random_baseline_results.csv"


def run_random_baseline():
    df = pd.read_csv(MERT_CSV)

    # 1. Isolate target mood dimensions
    all_cols = list(df.columns)
    split_idx = all_cols.index("mert_0")
    mood_cols = all_cols[:split_idx]

    df_clean = df.dropna(subset=mood_cols).copy()
    n_samples = len(df_clean)
    n_features = 1024

    # 2. Generate pure random Gaussian noise as features
    np.random.seed(42)
    X_random = np.random.randn(n_samples, n_features)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_random)

    # Load MERT Ridge scores for side-by-side comparison
    mert_map = {}
    if WEIGHTS_CSV.exists():
        mert_df = pd.read_csv(WEIGHTS_CSV)
        mert_map = dict(zip(mert_df["mood"], mert_df["r2"]))

    cv = KFold(n_splits=5, shuffle=True, random_state=42)
    alphas = np.logspace(-2, 4, 30)

    results = []

    print(f"Running Random Noise Baseline (N={n_samples}, D={n_features})...")
    print("=" * 80)
    print(
        f"{'Mood Dimension':<26} | {'MERT R²':<10} | {'Random R²':<11} | {'Delta':<8}"
    )
    print("=" * 80)

    for mood in mood_cols:
        y = df_clean[mood].values

        model = RidgeCV(alphas=alphas)
        y_pred = cross_val_predict(model, X_scaled, y, cv=cv)

        rand_r2 = r2_score(y, y_pred)
        rand_rmse = np.sqrt(mean_squared_error(y, y_pred))

        mert_r2 = mert_map.get(mood, np.nan)
        delta = rand_r2 - mert_r2 if not np.isnan(mert_r2) else np.nan

        mert_str = f"{mert_r2:+.4f}" if not np.isnan(mert_r2) else "N/A"
        delta_str = f"{delta:+.4f}" if not np.isnan(delta) else "N/A"

        print(f"{mood:<26} | {mert_str:<10} | {rand_r2:+.4f}     | {delta_str:<8}")

        results.append(
            {
                "mood": mood,
                "mert_r2": mert_r2,
                "random_r2": rand_r2,
                "delta_r2": delta,
                "random_rmse": rand_rmse,
            }
        )

    out_df = pd.DataFrame(results)
    out_df.to_csv(OUTPUT_CSV, index=False)
    print("=" * 80)
    print(f"Saved random baseline comparison to {OUTPUT_CSV}")


if __name__ == "__main__":
    run_random_baseline()
