import sys
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.linear_model import RidgeCV
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.model_selection import KFold, cross_val_predict
from sklearn.preprocessing import StandardScaler
from src.config import config

FEATURES_CSV = config["project_root"] / "datasets" / "cowen_features.csv"
MERT_EMBEDDINGS_CSV = config["project_root"] / "datasets" / "cowen_mert_embeddings.csv"
OUTPUT_FEATURES_WEIGHTS_CSV = config["project_root"] / "datasets" / "cowen_features_regression_weights.csv"
OUTPUT_MERT_WEIGHTS_CSV = config["project_root"] / "datasets" / "cowen_mert_regression_weights.csv"

# Dimensions dropped due to low cross-cultural stability or near-zero signal floor
DROPPED_EMOTIONS = {
    "entrancing",
    "goose bumps",
    "nauseating/revolting",
    "painful",
}


def _fit_and_evaluate(
    csv_path_or_df: Path | pd.DataFrame,
    output_path: Path,
    feature_start_col: str | None,
    feature_label: str,
    feature_cols: list[str] | None = None,
) -> pd.DataFrame | None:
    if isinstance(csv_path_or_df, Path):
        if not csv_path_or_df.exists():
            print(f"❌ File not found: {csv_path_or_df}")
            return None
        df = pd.read_csv(csv_path_or_df)
        source_name = csv_path_or_df.name
    else:
        df = csv_path_or_df
        source_name = "InMemory DataFrame"

    all_cols = list(df.columns)

    if feature_cols is None:
        if feature_start_col not in all_cols:
            print(f"❌ Column '{feature_start_col}' not found in dataset")
            return None
        split_idx = all_cols.index(feature_start_col)
        raw_mood_cols = all_cols[:split_idx]
        feature_cols = all_cols[split_idx:]
    else:
        raw_mood_cols = [
            c for c in all_cols if c not in feature_cols and not c.startswith("Unnamed")
        ]

    mood_cols = [m for m in raw_mood_cols if m not in DROPPED_EMOTIONS]

    print(f"\nEvaluating [{feature_label}] from {source_name}")
    print(
        f"Tracks: {len(df)} | Retained Emotions: {len(mood_cols)} (Dropped {len(DROPPED_EMOTIONS)}) | Features: {len(feature_cols)}"
    )

    df_clean = df.dropna(subset=feature_cols + mood_cols).copy()
    X = df_clean[feature_cols].values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    cv = KFold(n_splits=5, shuffle=True, random_state=42)
    alphas = np.logspace(-2, 4, 30)

    summary_records = []

    print("\n" + "=" * 95)
    print(
        f"{'Mood Dimension':<26} | {'R²':<7} | {'RMSE':<7} | Top Positive & Negative Drivers"
    )
    print("=" * 95)

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
    print("=" * 95)
    print(f"✅ Saved trained weights ({len(results_df)} emotions) to {output_path}")
    return results_df


def run_dsp_regression():
    return _fit_and_evaluate(
        csv_path_or_df=Path(FEATURES_CSV),
        output_path=Path(OUTPUT_FEATURES_WEIGHTS_CSV),
        feature_start_col="vocal_probability",
        feature_label="18 Handcrafted DSP Features",
    )


def run_mert_regression():
    return _fit_and_evaluate(
        csv_path_or_df=Path(MERT_EMBEDDINGS_CSV),
        output_path=Path(OUTPUT_MERT_WEIGHTS_CSV),
        feature_start_col="mert_0",
        feature_label="1024 MERT Embeddings",
    )


def run_dsp_mert_hybrid_regression():
    dsp_path = Path(FEATURES_CSV)
    mert_path = Path(MERT_EMBEDDINGS_CSV)

    if not dsp_path.exists() or not mert_path.exists():
        print(
            f"❌ Both {FEATURES_CSV} and {MERT_EMBEDDINGS_CSV} must exist."
        )
        return None

    dsp_df = pd.read_csv(dsp_path)
    mert_df = pd.read_csv(mert_path)

    # Determine DSP feature list (from vocal_probability onwards)
    dsp_cols = list(dsp_df.columns)
    dsp_split = dsp_cols.index("vocal_probability")
    dsp_feature_cols = dsp_cols[dsp_split:]

    # Determine MERT feature list (mert_0 to mert_1023)
    mert_cols = list(mert_df.columns)
    mert_split = mert_cols.index("mert_0")
    mert_feature_cols = mert_cols[mert_split:]

    # Merge on audio identification column if available, or align row-for-row
    id_col = None
    for candidate in ["path", "filename", "audio_path", "track_id"]:
        if candidate in dsp_df.columns and candidate in mert_df.columns:
            id_col = candidate
            break

    if id_col:
        print(f"Merging DSP and MERT on identifier column: '{id_col}'")
        combined_df = pd.merge(
            dsp_df,
            mert_df[[id_col] + mert_feature_cols],
            on=id_col,
            how="inner",
        )
    else:
        print("No shared ID column found; asserting 1-to-1 row index alignment...")
        if len(dsp_df) != len(mert_df):
            print(
                f"❌ Row count mismatch: DSP has {len(dsp_df)}, MERT has {len(mert_df)}"
            )
            return None
        combined_df = pd.concat([dsp_df, mert_df[mert_feature_cols]], axis=1)

    combined_features = dsp_feature_cols + mert_feature_cols

    return _fit_and_evaluate(
        csv_path_or_df=combined_df,
        output_path=Path("datasets/cowen_hybrid_regression_weights.csv"),
        feature_start_col=None,
        feature_cols=combined_features,
        feature_label=f"Hybrid ({len(dsp_feature_cols)} DSP + {len(mert_feature_cols)} MERT)",
    )


def run_comparison():
    dsp_res = run_dsp_regression()
    mert_res = run_mert_regression()
    hybrid_res = run_dsp_mert_hybrid_regression()

    if dsp_res is None or mert_res is None or hybrid_res is None:
        return

    comp_df = pd.merge(
        dsp_res[["mood", "r2"]].rename(columns={"r2": "dsp_r2"}),
        mert_res[["mood", "r2"]].rename(columns={"r2": "mert_r2"}),
        on="mood",
    )
    comp_df = pd.merge(
        comp_df,
        hybrid_res[["mood", "r2"]].rename(columns={"r2": "hybrid_r2"}),
        on="mood",
    )
    comp_df["hybrid_vs_mert"] = comp_df["hybrid_r2"] - comp_df["mert_r2"]

    print("\n" + "#" * 84)
    print(
        f"{'Mood Dimension':<26} | {'DSP R²':<8} | {'MERT R²':<8} | {'Hybrid R²':<9} | {'Hybrid-MERT Δ'}"
    )
    print("#" * 84)
    for _, row in comp_df.iterrows():
        print(
            f"{row['mood']:<26} | {row['dsp_r2']:+.4f}   | {row['mert_r2']:+.4f}   | {row['hybrid_r2']:+.4f}    | {row['hybrid_vs_mert']:+.4f}"
        )
    print("#" * 84)

    mean_mert = comp_df["mert_r2"].mean()
    mean_hybrid = comp_df["hybrid_r2"].mean()
    print(
        f"\nMean R² -> MERT: {mean_mert:.4f} | Hybrid: {mean_hybrid:.4f} (Δ: {mean_hybrid - mean_mert:+.4f})"
    )


if __name__ == "__main__":
    arg = sys.argv[1].lower() if len(sys.argv) > 1 else "dsp"

    if arg == "mert":
        run_mert_regression()
    elif arg == "hybrid":
        run_dsp_mert_hybrid_regression()
    elif arg == "all":
        run_comparison()
    else:
        run_dsp_regression()
