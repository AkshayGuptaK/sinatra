from abc import ABC, abstractmethod
import time
from typing import Dict, List, Optional
import numpy as np
import pandas as pd
from sklearn.linear_model import RidgeCV
from sklearn.preprocessing import StandardScaler

from src.pg import get_pg


def parse_vector(raw_vec) -> np.ndarray:
    if isinstance(raw_vec, str):
        cleaned = raw_vec.strip("[]").split(",")
        return np.array([float(x) for x in cleaned], dtype=np.float32)
    return np.asarray(raw_vec, dtype=np.float32)


class BaseTagSuggester(ABC):
    """Abstract base class for tag recommendation engines."""

    @abstractmethod
    def fit(self) -> None:
        """Initialize and precompute models/indexes."""
        pass

    @abstractmethod
    def suggest_tags(
        self,
        embedding: np.ndarray,
        threshold: float = 0.50,
    ) -> Dict[str, float]:
        """Given a 1024-d MERT embedding, return tags with confidence > threshold."""
        pass


class BalancedRidgeTagSuggester(BaseTagSuggester):
    """
    Predicts continuous tag presence using Balanced Ridge Probes.
    Weights each tag's positive tracks inversely to base rate to prevent shrinkage.
    Stores weights W (1024, N_tags) and bias b (N_tags) in memory for sub-millisecond scoring.
    """

    def __init__(self, min_support: int = 5, alphas: Optional[np.ndarray] = None):
        self.min_support = min_support
        self.alphas = alphas if alphas is not None else np.logspace(-2, 4, 25)

        self.scaler: Optional[StandardScaler] = None
        self.tag_names: List[str] = []
        self.weights: Optional[np.ndarray] = None  # Shape: (1024, N_tags)
        self.biases: Optional[np.ndarray] = None  # Shape: (N_tags,)
        self.is_fitted: bool = False

    def fit(self) -> None:
        db = get_pg()
        query = """
            SELECT 
                id::text,
                musical_embedding,
                tags
            FROM nodes
            WHERE musical_embedding IS NOT NULL
              AND tags IS NOT NULL
              AND cardinality(tags) > 0;
        """

        t0 = time.perf_counter()
        print("🔧 Initializing BalancedRidgeTagSuggester: Fetching tracks from DB...")
        with db.conn.cursor() as cur:
            cur.execute(query)
            rows = cur.fetchall()

        if not rows:
            print("⚠️ No eligible tracks found with embeddings and tags.")
            return

        embeddings = []
        track_tags_list = []
        track_ids = []

        for track_id, emb, raw_tags in rows:
            vec = parse_vector(emb)
            if vec.shape[0] != 1024:
                continue

            if isinstance(raw_tags, list):
                tag_set = {str(t).strip().lower() for t in raw_tags if str(t).strip()}
            elif isinstance(raw_tags, str):
                tag_set = {
                    t.strip().lower()
                    for t in raw_tags.strip("{}[]").split(",")
                    if t.strip()
                }
            else:
                tag_set = set()

            if not tag_set:
                continue

            embeddings.append(vec)
            track_tags_list.append(tag_set)
            track_ids.append(track_id)

        X = np.vstack(embeddings)
        n_tracks = len(X)

        # 1. Identify all eligible tags meeting the minimum support threshold
        tag_counts: Dict[str, int] = {}
        for tags in track_tags_list:
            for t in tags:
                tag_counts[t] = tag_counts.get(t, 0) + 1

        eligible_tags = sorted(
            [tag for tag, count in tag_counts.items() if count >= self.min_support]
        )
        self.tag_names = eligible_tags
        n_tags = len(eligible_tags)

        print(
            f"   Found {n_tracks} tracks. {len(tag_counts)} distinct tags, "
            f"{n_tags} meet min_support >= {self.min_support}."
        )

        if n_tags == 0:
            print("⚠️ No tags meet support threshold.")
            return

        # 2. Fit global feature scaler
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        # 3. Fit Ridge probes for each tag
        # We store the resulting linear weights and intercept
        W_list = []
        b_list = []

        for tag in eligible_tags:
            y = np.array(
                [1.0 if tag in s else 0.0 for s in track_tags_list], dtype=np.float32
            )
            base_rate = float(y.mean())

            # Balanced class weights: pos_weight = (1 - p) / p
            sample_weight = np.ones_like(y)
            if 0.0 < base_rate < 1.0:
                pos_weight = (1.0 - base_rate) / base_rate
                sample_weight[y == 1.0] = pos_weight

            clf = RidgeCV(alphas=self.alphas)
            clf.fit(X_scaled, y, sample_weight=sample_weight)

            W_list.append(clf.coef_)
            b_list.append(clf.intercept_)

        self.weights = np.column_stack(W_list)  # (1024, n_tags)
        self.biases = np.array(b_list, dtype=np.float32)  # (n_tags,)
        self.is_fitted = True

        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        print(
            f"✅ BalancedRidgeTagSuggester ready! Fitted {n_tags} tag hyperplanes in {elapsed_ms:.1f} ms."
        )

    def suggest_tags(
        self,
        embedding: str,
        threshold: float = 0.50,
    ) -> Dict[str, float]:
        """
        Calculates tag suggestions for a 1024-D embedding.
        Returns a dict of {tag_name: confidence} sorted descending, where confidence >= threshold.
        """
        vector = parse_vector(embedding)

        if not self.is_fitted or self.weights is None or self.scaler is None:
            raise RuntimeError("Tag suggester model is not fitted yet.")

        vec = np.asarray(vector, dtype=np.float32).reshape(1, -1)
        if vec.shape[1] != 1024:
            raise ValueError(f"Expected 1024-D embedding, got {vec.shape[1]}")

        # Scale embedding
        vec_scaled = self.scaler.transform(vec)

        # Linear projection dot product: y_hat = x^T W + b
        raw_scores = (np.dot(vec_scaled, self.weights) + self.biases)[0]
        clipped_scores = np.clip(raw_scores, 0.0, 1.0)

        suggestions = {}
        for idx, tag in enumerate(self.tag_names):
            score = float(clipped_scores[idx])
            if score >= threshold:
                print(score, threshold)
                suggestions[tag] = round(score, 4)

        # Return sorted by highest confidence first
        return dict(sorted(suggestions.items(), key=lambda item: item[1], reverse=True))


# Singleton instance accessible throughout the server
_tag_suggester_instance: Optional[BaseTagSuggester] = None


def get_tag_suggester() -> BaseTagSuggester:
    global _tag_suggester_instance
    if _tag_suggester_instance is None:
        _tag_suggester_instance = BalancedRidgeTagSuggester(min_support=5)
        _tag_suggester_instance.fit()
    return _tag_suggester_instance
