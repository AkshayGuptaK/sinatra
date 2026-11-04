from pathlib import Path
from typing import Any, Dict, List, Tuple
import numpy as np
import pandas as pd
from src.config import config


class EmotionScorer:
    """Computes calibrated Cowen mood dimensions from 1024-dim MERT embeddings.

    Loads fitted Ridge regression weights/biases and establishes baseline empirical
    distribution anchors (1st and 99th percentiles) from the training corpus.
    Produces both a dictionary for intuitive filtering
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

        print(f"Loading Cowen Emotion Scorer weights from: {self.weights_path}...")
        self.emotion_names: List[str] = []
        self.weights: np.ndarray  # Shape: (1024, 24)
        self.biases: np.ndarray  # Shape: (24,)
        self._load_weights()

    def _load_weights(self) -> None:
        df = pd.read_csv(self.weights_path)
        self.emotion_names = df["mood"].tolist()

        weight_cols = [f"w_mert_{i}" for i in range(1024)]
        missing_cols = [c for c in weight_cols if c not in df.columns]
        if missing_cols:
            raise ValueError(
                f"Corrupted weights file: missing {len(missing_cols)} weight columns."
            )

        # Transpose to shape (1024, N_MOODS) so we can compute: X @ W + b
        self.weights = df[weight_cols].values.T.astype(np.float32)
        self.biases = df["intercept"].values.astype(np.float32)

    def score(
        self, embedding: np.ndarray | List[float]
        ) -> Tuple[Dict[str, float], List[float], Dict[str, float], List[float]]:
        """Projects a 1024-dimensional MERT embedding into mood space.

        Computes continuous regression scores (y = x @ W + b)

        Args:
            embedding: 1024-element vector (list or numpy array).

        Returns:
            A tuple of 2 items:
                1. acoustic_emotion_dict: {emotion_name: score} (floats)
                2. acoustic_emotion_vector: continuous 24-dim vector as list[float]
        """
        x = np.asarray(embedding, dtype=np.float32)
        if x.ndim != 1 or x.shape[0] != 1024:
            raise ValueError(f"Expected 1024-dim embedding vector, got shape {x.shape}")

        emotion_scores = np.dot(x, self.weights) + self.biases
        acoustic_emotion_dict: Dict[str, float] = {
            emotion: round(float(val), 6) for emotion, val in zip(self.emotion_names, emotion_scores)
        }
        acoustic_emotion_vector = [float(v) for v in emotion_scores]

        return acoustic_emotion_dict, acoustic_emotion_vector

_scorer_instance: EmotionScorer | None = None


def get_emotion_scorer() -> EmotionScorer:
    global _scorer_instance
    if _scorer_instance is None:
        _scorer_instance = EmotionScorer()
    return _scorer_instance
