import argparse
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.linear_model import RidgeCV
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.model_selection import KFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from src.config import config

DATASETS_DIR = config["project_root"] / "datasets"
FEATURES_CSV = DATASETS_DIR / "cowen_features.csv"
MERT_EMBEDDINGS_CSV = DATASETS_DIR / "cowen_mert_embeddings.csv"
OUTPUT_FEATURES_WEIGHTS_CSV = DATASETS_DIR / "cowen_features_regression_weights.csv"

# Dimensions dropped due to low cross-cultural stability or near-zero signal floor
DROPPED_EMOTIONS = {
    "entrancing",
    "goose bumps",
    "nauseating/revolting",
    "painful",
}


def _fit_and_evaluate(
    csv_path_or_df: Path | pd.DataFrame,
    output_path: Path | None = None,
    feature_start_col: str | None = None,
    feature_label: str = "Features",
    feature_cols: list[str] | None = None,
    save_weights: bool = True,
    verbose: bool = True,
    n_splits: int = 10,
    random_state: int = 42,
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
        if feature_start_col is None:
            mert_cols = [c for c in all_cols if c.startswith("mert_")]
            if mert_cols:
                feature_start_col = mert_cols[0]
            elif "vocal_probability" in all_cols:
                feature_start_col = "vocal_probability"
            else:
                print(f"❌ Could not infer feature columns in dataset: {source_name}")
                return None

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

    if verbose:
        print(f"\nEvaluating [{feature_label}] from {source_name}")
        print(
            f"Tracks: {len(df)} | Retained Emotions: {len(mood_cols)} (Dropped {len(DROPPED_EMOTIONS)}) | Features: {len(feature_cols)}"
        )

    df_clean = df.dropna(subset=feature_cols + mood_cols).copy()
    X = df_clean[feature_cols].values.astype(np.float32)

    cv = KFold(n_splits=n_splits, shuffle=True, random_state=random_state)
    alphas = np.logspace(-1, 6, 50)

    summary_records = []

    if verbose:
        print("\n" + "=" * 95)
        print(
            f"{'Mood Dimension':<26} | {'R²':<7} | {'RMSE':<7} | Top Positive & Negative Drivers (Std)"
        )
        print("=" * 95)

    for mood in mood_cols:
        y = df_clean[mood].values.astype(np.float32)

        # 1. Leak-free cross-validation via Pipeline
        pipe = make_pipeline(StandardScaler(), RidgeCV(alphas=alphas))
        y_pred = cross_val_predict(pipe, X, y, cv=cv, n_jobs=-1)

        r2 = r2_score(y, y_pred)
        rmse = np.sqrt(mean_squared_error(y, y_pred))

        # 2. Fit on 100% of data to extract parameters
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        model = RidgeCV(alphas=alphas)
        model.fit(X_scaled, y)

        scaled_coefs = model.coef_
        scaled_intercept = model.intercept_

        # 3. Fold StandardScaler into raw weights and intercept
        # y_hat = (x - mu) / sigma @ w_scaled + b_scaled
        #       = x @ (w_scaled / sigma) + (b_scaled - (mu / sigma) @ w_scaled)
        raw_coefs = scaled_coefs / scaler.scale_
        raw_intercept = float(scaled_intercept - np.dot(raw_coefs, scaler.mean_))

        if verbose:
            sorted_indices = np.argsort(scaled_coefs)
            top_neg_idx = sorted_indices[:2]
            top_pos_idx = sorted_indices[-2:][::-1]

            pos_str = ", ".join(
                [f"+{feature_cols[i]} ({scaled_coefs[i]:+.2f})" for i in top_pos_idx]
            )
            neg_str = ", ".join(
                [f"{feature_cols[i]} ({scaled_coefs[i]:+.2f})" for i in top_neg_idx]
            )
            drivers_str = f"{pos_str} | {neg_str}"
            print(f"{mood:<26} | {r2:+.4f} | {rmse:.4f} | {drivers_str}")

        record = {
            "mood": mood,
            "r2": r2,
            "rmse": rmse,
            "intercept": raw_intercept,
        }
        if save_weights and output_path is not None:
            record.update(
                {f"w_{col}": float(coef) for col, coef in zip(feature_cols, raw_coefs)}
            )

        summary_records.append(record)

    results_df = pd.DataFrame(summary_records)

    if save_weights and output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        results_df.to_csv(output_path, index=False)
        if verbose:
            print("=" * 95)
            print(
                f"✅ Saved unscaled-ready weights ({len(results_df)} emotions | Mean R²: {results_df['r2'].mean():.4f}) to {output_path}"
            )

    return results_df


def run_dsp_regression(n_splits: int = 10):
    return _fit_and_evaluate(
        csv_path_or_df=Path(FEATURES_CSV),
        output_path=Path(OUTPUT_FEATURES_WEIGHTS_CSV),
        feature_start_col="vocal_probability",
        feature_label="18 Handcrafted DSP Features",
        n_splits=n_splits,
    )


def run_mert_regression(
    csv_name: str = "cowen_MERT-v2-30s_L24_final_embeddings",
    output_name: str | None = None,
    verbose: bool = True,
    n_splits: int = 10,
):
    input_path = DATASETS_DIR / f"{csv_name}.csv"
    out_stem = output_name or f"{csv_name}_regression_weights"
    output_path = DATASETS_DIR / f"{out_stem}.csv"

    return _fit_and_evaluate(
        csv_path_or_df=input_path,
        output_path=output_path,
        feature_start_col=None,
        feature_label=f"MERT [{csv_name}]",
        verbose=verbose,
        n_splits=n_splits,
    )


def run_dsp_mert_hybrid_regression(n_splits: int = 10):
    dsp_path = Path(FEATURES_CSV)
    mert_path = Path(MERT_EMBEDDINGS_CSV)

    if not dsp_path.exists() or not mert_path.exists():
        print(f"❌ Both {FEATURES_CSV} and {MERT_EMBEDDINGS_CSV} must exist.")
        return None

    dsp_df = pd.read_csv(dsp_path)
    mert_df = pd.read_csv(mert_path)

    dsp_cols = list(dsp_df.columns)
    dsp_split = dsp_cols.index("vocal_probability")
    dsp_feature_cols = dsp_cols[dsp_split:]

    mert_cols = list(mert_df.columns)
    mert_feature_cols = [c for c in mert_cols if c.startswith("mert_")]

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
        output_path=DATASETS_DIR / "cowen_hybrid_regression_weights.csv",
        feature_start_col=None,
        feature_cols=combined_features,
        feature_label=f"Hybrid ({len(dsp_feature_cols)} DSP + {len(mert_feature_cols)} MERT)",
        n_splits=n_splits,
    )


def compare_mert_embeddings(
    embedding_csv_names: list[str], n_splits: int = 10
) -> pd.DataFrame | None:
    if not embedding_csv_names:
        print("❌ No embedding names provided to compare.")
        return None

    print(f"\nComparing {len(embedding_csv_names)} MERT Embedding Variations:")
    for name in embedding_csv_names:
        print(f"  • {name}")

    results = {}
    for name in embedding_csv_names:
        print(f"\nFitting RidgeCV on: {name}...")
        res = run_mert_regression(csv_name=name, verbose=False, n_splits=n_splits)
        if res is not None:
            display_label = name.replace("cowen_", "").replace("_embeddings", "")
            results[display_label] = res.set_index("mood")["r2"]

    if not results:
        print("❌ No valid embedding results to display.")
        return None

    comp_df = pd.DataFrame(results)
    mean_row = comp_df.mean(axis=0)
    mean_row.name = "== MEAN R² =="
    display_df = pd.concat([comp_df, pd.DataFrame([mean_row])])

    col_width = max(14, max(len(c) for c in display_df.columns) + 2)
    header = f"{'Mood Dimension':<26} | " + " | ".join(
        f"{c:>{col_width}}" for c in display_df.columns
    )
    sep = "-" * len(header)

    print("\n" + "#" * len(header))
    print("📊 MERT EMBEDDINGS R² COMPARISON TABLE")
    print("#" * len(header))
    print(header)
    print(sep)

    for mood, row in display_df.iterrows():
        if mood == "== MEAN R² ==":
            print(sep)
            vals = " | ".join(f"{v:>+{col_width}.4f}" for v in row)
            print(f"\033[1m{mood:<26}\033[0m | {vals}")
        else:
            vals = " | ".join(f"{v:>+{col_width}.4f}" for v in row)
            print(f"{mood:<26} | {vals}")

    print("#" * len(header) + "\n")
    return comp_df


def run_comparison(n_splits: int = 10):
    dsp_res = run_dsp_regression(n_splits=n_splits)
    mert_res = run_mert_regression(n_splits=n_splits)
    hybrid_res = run_dsp_mert_hybrid_regression(n_splits=n_splits)

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
    parser = argparse.ArgumentParser(description="Cowen Emotion Regression Runner")
    parser.add_argument(
        "mode",
        nargs="?",
        default="mert",
        help="Mode: mert, dsp, hybrid, all, or compare-mert",
    )
    parser.add_argument(
        "--file",
        type=str,
        default="cowen_MERT-v2-30s_L24_final_embeddings",
        help="Filename stem to use for single 'mert' run (without path or .csv)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Optional custom output filename stem (without path or .csv)",
    )
    parser.add_argument(
        "--files",
        nargs="+",
        help="List of embedding filename stems to compare (without path or .csv)",
    )
    parser.add_argument(
        "--splits",
        type=int,
        default=10,
        help="Number of cross-validation folds (default: 10)",
    )

    args = parser.parse_args()
    mode = args.mode.lower()

    if mode in ("compare-mert", "compare_mert"):
        files = args.files or [
            "cowen_mert_embeddings",
            "cowen_MERT-v2-30s_L14_embeddings",
            "cowen_MERT-v2-30s_L16_embeddings",
            "cowen_MERT-v2-30s_L19_embeddings",
            "cowen_MERT-v2-30s_L23_embeddings",
            "cowen_MERT-v2-30s_L24_final_embeddings",
        ]
        compare_mert_embeddings(files, n_splits=args.splits)
    elif mode == "mert":
        run_mert_regression(
            csv_name=args.file, output_name=args.output, n_splits=args.splits
        )
    elif mode == "hybrid":
        run_dsp_mert_hybrid_regression(n_splits=args.splits)
    elif mode == "all":
        run_comparison(n_splits=args.splits)
    else:
        run_dsp_regression(n_splits=args.splits)
