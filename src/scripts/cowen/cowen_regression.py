import sys
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.linear_model import RidgeCV
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.model_selection import KFold, cross_val_predict
from sklearn.preprocessing import StandardScaler

# Dimensions dropped due to low cross-cultural stability or near-zero signal floor
DROPPED_EMOTIONS = {
    "entrancing",
    "goose bumps",
    "nauseating/revolting",
    "painful",
}


def _fit_and_evaluate(
    csv_path: Path, output_path: Path, feature_start_col: str, feature_label: str
) -> pd.DataFrame | None:
    if not csv_path.exists():
        print(f"❌ File not found: {csv_path}")
        return None

    df = pd.read_csv(csv_path)

    all_cols = list(df.columns)
    if feature_start_col not in all_cols:
        print(f"❌ Column '{feature_start_col}' not found in {csv_path}")
        return None

    split_idx = all_cols.index(feature_start_col)
    raw_mood_cols = all_cols[:split_idx]
    mood_cols = [m for m in raw_mood_cols if m not in DROPPED_EMOTIONS]
    feature_cols = all_cols[split_idx:]

    print(f"\nEvaluating [{feature_label}] from {csv_path.name}")
    print(
        f"Tracks: {len(df)} | Retained Moods: {len(mood_cols)} (Dropped {len(DROPPED_EMOTIONS)}) | Features: {len(feature_cols)}"
    )

    df_clean = df.dropna(subset=feature_cols + mood_cols).copy()
    X = df_clean[feature_cols].values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    cv = KFold(n_splits=5, shuffle=True, random_state=42)
    alphas = np.logspace(-2, 4, 30)

    summary_records = []

    print("\n" + "=" * 90)
    print(
        f"{'Mood Dimension':<26} | {'R²':<7} | {'RMSE':<7} | Top Positive & Negative Drivers"
    )
    print("=" * 90)

    for mood in mood_cols:
        y = df_clean[mood].values

        model = RidgeCV(alphas=alphas)
        y_pred = cross_val_predict(model, X_scaled, y, cv=cv)

        r2 = r2_score(y, y_pred)
        rmse = np.sqrt(mean_squared_error(y, y_pred))

        model.fit(X_scaled, y)
        coefs = model.coef_

        sorted_indices = np.argsort(coefs)
        top_neg_idx = sorted_indices[:2]
        top_pos_idx = sorted_indices[-2:][::-1]

        pos_str = ", ".join(
            [f"+{feature_cols[i]} ({coefs[i]:+.2f})" for i in top_pos_idx]
        )
        neg_str = ", ".join(
            [f"{feature_cols[i]} ({coefs[i]:+.2f})" for i in top_neg_idx]
        )
        drivers_str = f"{pos_str} | {neg_str}"

        print(f"{mood:<26} | {r2:+.4f} | {rmse:.4f} | {drivers_str}")

        summary_records.append(
            {
                "mood": mood,
                "r2": r2,
                "rmse": rmse,
                **{f"w_{col}": coef for col, coef in zip(feature_cols, coefs)},
                "intercept": model.intercept_,
            }
        )

    results_df = pd.DataFrame(summary_records)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    results_df.to_csv(output_path, index=False)
    print("=" * 90)
    print(f"✅ Saved trained weights ({len(results_df)} moods) to {output_path}")
    return results_df


def run_dsp_regression():
    return _fit_and_evaluate(
        csv_path=Path("datasets/cowen.csv"),
        output_path=Path("datasets/cowen_regression_weights.csv"),
        feature_start_col="vocal_probability",
        feature_label="18 Handcrafted DSP Features",
    )


def run_mert_regression():
    return _fit_and_evaluate(
        csv_path=Path("datasets/cowen_mert_embeddings.csv"),
        output_path=Path("datasets/cowen_mert_regression_weights.csv"),
        feature_start_col="mert_0",
        feature_label="1024 MERT Embeddings",
    )


def run_comparison():
    dsp_res = run_dsp_regression()
    mert_res = run_mert_regression()

    if dsp_res is None or mert_res is None:
        return

    comp_df = pd.merge(
        dsp_res[["mood", "r2"]].rename(columns={"r2": "dsp_r2"}),
        mert_res[["mood", "r2"]].rename(columns={"r2": "mert_r2"}),
        on="mood",
    )
    comp_df["delta_r2"] = comp_df["mert_r2"] - comp_df["dsp_r2"]

    print("\n" + "#" * 70)
    print(f"{'Mood Dimension':<26} | {'DSP R²':<9} | {'MERT R²':<9} | {'Delta R²':<9}")
    print("#" * 70)
    for _, row in comp_df.iterrows():
        print(
            f"{row['mood']:<26} | {row['dsp_r2']:+.4f}   | {row['mert_r2']:+.4f}   | {row['delta_r2']:+.4f}"
        )
    print("#" * 70)


if __name__ == "__main__":
    arg = sys.argv[1].lower() if len(sys.argv) > 1 else "dsp"

    if arg == "mert":
        run_mert_regression()
    elif arg == "all":
        run_comparison()
    else:
        run_dsp_regression()
