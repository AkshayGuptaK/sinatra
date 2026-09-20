from pathlib import Path
from typing import Any, Dict, List, Tuple
import numpy as np
import pandas as pd
from src.config import config


class MoodScorer:
    """Computes calibrated Cowen mood dimensions from 1024-dim MERT embeddings.

    Loads fitted Ridge regression weights/biases and establishes baseline empirical
    distribution anchors (1st and 99th percentiles) from the training corpus.
    Produces both a normalized [0.0, 1.0] dictionary for intuitive filtering
    and a raw continuous 24-dim vector for manifold vector distance queries.
    """

    def __init__(
        self,
        weights_path: Path | str | None = None,
        reference_corpus_path: Path | str | None = None,
    ):
        if weights_path is None:
            self.weights_path = (
                config["project_root"]
                / "datasets"
                / "cowen_mert_regression_weights.csv"
            )
        else:
            self.weights_path = Path(weights_path)

        if not self.weights_path.exists():
            raise FileNotFoundError(
                f"Mood weights not found at: {self.weights_path}. "
                "Run `uv run python -m src.scripts.cowen_regression mert` first."
            )

        if reference_corpus_path is None:
            self.ref_path = (
                config["project_root"] / "datasets" / "cowen_mert_embeddings.csv"
            )
        else:
            self.ref_path = Path(reference_corpus_path)

        print(f"Loading Cowen MoodScorer weights from: {self.weights_path}...")
        self.mood_names: List[str] = []
        self.weights: np.ndarray  # Shape: (1024, 24)
        self.biases: np.ndarray  # Shape: (24,)
        self._load_weights()

        # Calibration arrays for 0.0 - 1.0 normalization
        self.p_min: np.ndarray  # Shape: (24,)
        self.p_range: np.ndarray  # Shape: (24,)
        self._load_calibration_stats()

    def _load_weights(self) -> None:
        df = pd.read_csv(self.weights_path)
        self.mood_names = df["mood"].tolist()

        weight_cols = [f"w_mert_{i}" for i in range(1024)]
        missing_cols = [c for c in weight_cols if c not in df.columns]
        if missing_cols:
            raise ValueError(
                f"Corrupted weights file: missing {len(missing_cols)} weight columns."
            )

        # Transpose to shape (1024, N_MOODS) so we can compute: X @ W + b
        self.weights = df[weight_cols].values.T.astype(np.float32)
        self.biases = df["intercept"].values.astype(np.float32)

    # TODO: write comment
    def _load_calibration_stats(self) -> None:
        if not self.ref_path.exists():
            self.p_min = np.zeros(len(self.mood_names), dtype=np.float32)
            self.p_range = np.ones(len(self.mood_names), dtype=np.float32)
            return

        ref_df = pd.read_csv(self.ref_path)
        feature_cols = [f"mert_{i}" for i in range(1024)]

        # Get raw training embeddings: shape (N, 1024)
        X_train = ref_df[feature_cols].values.astype(np.float32)

        # Generate the model's actual predictions on the training data: shape (N, 24)
        y_train_pred = np.dot(X_train, self.weights) + self.biases

        # Calculate percentiles on the MODEL's output distribution
        p1 = np.percentile(y_train_pred, 1, axis=0)
        p99 = np.percentile(y_train_pred, 99, axis=0)

        self.p_min = p1.astype(np.float32)
        diff = p99 - p1
        self.p_range = np.where(diff > 1e-6, diff, 1.0).astype(np.float32)

    def score(
        self, embedding: np.ndarray | List[float]
    ) -> Tuple[Dict[str, float], List[float], Dict[str, float], List[float]]:
        """Projects a 1024-dimensional MERT embedding into mood space.

        Computes both raw continuous regression scores (y = x @ W + b) and
        calibrated scores normalized against the empirical distribution into [0.0, 1.0].

        Args:
            embedding: 1024-element vector (list or numpy array).

        Returns:
            A tuple of 4 items:
                1. raw_moods_dict: {mood_name: raw_score} (unnormalized floats)
                2. raw_mood_vector: raw continuous 24-dim vector as list[float]
                3. norm_moods_dict: {mood_name: norm_score} (calibrated to [0.0, 1.0])
                4. norm_mood_vector: normalized 24-dim vector as list[float]
        """
        x = np.asarray(embedding, dtype=np.float32)
        if x.ndim != 1 or x.shape[0] != 1024:
            raise ValueError(f"Expected 1024-dim embedding vector, got shape {x.shape}")

        # 1. Raw linear prediction: y = x @ W + b
        raw_scores = np.dot(x, self.weights) + self.biases
        raw_moods_dict: Dict[str, float] = {
            mood: round(float(val), 6) for mood, val in zip(self.mood_names, raw_scores)
        }
        raw_mood_vector = [float(v) for v in raw_scores]

        # 2. Normalized prediction: [0.0, 1.0]
        norm_scores = np.clip((raw_scores - self.p_min) / self.p_range, 0.0, 1.0)
        norm_moods_dict: Dict[str, float] = {
            mood: round(float(val), 4)
            for mood, val in zip(self.mood_names, norm_scores)
        }
        norm_mood_vector = [round(float(v), 6) for v in norm_scores]

        return raw_moods_dict, raw_mood_vector, norm_moods_dict, norm_mood_vector


_scorer_instance: MoodScorer | None = None


def get_mood_scorer() -> MoodScorer:
    global _scorer_instance
    if _scorer_instance is None:
        _scorer_instance = MoodScorer()
    return _scorer_instance
