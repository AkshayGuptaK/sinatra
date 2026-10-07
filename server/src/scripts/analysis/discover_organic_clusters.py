import argparse
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components
from sklearn.metrics.pairwise import cosine_distances

from src.pg import get_pg


def parse_vector(raw_vec) -> np.ndarray:
    if isinstance(raw_vec, str):
        cleaned = raw_vec.strip("[]").split(",")
        return np.array([float(x) for x in cleaned], dtype=np.float32)
    return np.asarray(raw_vec, dtype=np.float32)


def get_components(
    dist_matrix: np.ndarray, threshold: float, min_degree: int = 1
) -> list[list[int]]:
    """Builds an adjacency graph for distances <= threshold and returns connected components.

    When min_degree=1, it behaves identically to pure connected components.
    When min_degree > 1, nodes must have at least `min_degree` neighbors within
    the threshold to participate, eliminating weak single-edge bridging filaments.
    """
    mask = dist_matrix <= threshold
    np.fill_diagonal(mask, False)

    if min_degree > 1:
        degrees = mask.sum(axis=1)
        dense_mask = degrees >= min_degree
        mask[~dense_mask, :] = False
        mask[:, ~dense_mask] = False
    else:
        dense_mask = np.ones(dist_matrix.shape[0], dtype=bool)

    graph = csr_matrix(mask)
    n_components, labels = connected_components(
        csgraph=graph, directed=False, return_labels=True
    )

    components = [[] for _ in range(n_components)]
    for idx, label in enumerate(labels):
        if dense_mask[idx]:
            components[label].append(idx)

    # Exclude any empty components or singletons from degree pruning
    return [c for c in components if len(c) > 0]


def find_largest_safe_threshold(
    dist_matrix: np.ndarray,
    max_cluster_size: int,
    min_degree: int = 1,
    low: float = 0.01,
    high: float = 0.50,
    iterations: int = 15,
) -> float:
    """Binary searches for the maximum max_dist such that no component exceeds max_cluster_size."""
    print(
        f"🔎 Binary searching optimal max_dist in [{low:.3f}, {high:.3f}] ({iterations} steps, min_degree={min_degree})..."
    )

    best_dist = low
    for step in range(1, iterations + 1):
        mid = (low + high) / 2.0
        components = get_components(dist_matrix, mid, min_degree=min_degree)

        max_size_seen = max((len(c) for c in components), default=0)

        print(
            f"  Step {step:02d}/{iterations:02d}: testing dist = {mid:.4f} -> Largest component = {max_size_seen} tracks"
        )

        if max_size_seen <= max_cluster_size:
            best_dist = mid
            low = mid
        else:
            high = mid

    print(
        f"✅ Converged on max_dist: {best_dist:.4f} (Strict constraint: <= {max_cluster_size} tracks)\n"
    )
    return best_dist


def discover_clusters(
    min_cluster_size: int = 6,
    max_cluster_size: int = 15,
    vector_column: str = "musical_embedding",
    min_degree: int = 1,
    search_iterations: int = 15,
):
    db = get_pg()

    query = f"""
        SELECT 
            id::text,
            COALESCE(title, filepath) AS title,
            COALESCE(mood, 'UNLABELED') AS mood,
            {vector_column} AS embedding
        FROM nodes
        WHERE {vector_column} IS NOT NULL;
    """

    print(f"Fetching tracks with '{vector_column}' from PostgreSQL...")
    with db.conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()

    if not rows:
        print("❌ No tracks found.")
        return

    data = []
    vectors = []
    for track_id, title, mood, emb in rows:
        vec = parse_vector(emb)
        data.append(
            {
                "id": track_id,
                "title": title.split("/")[-1],
                "mood": mood.strip().title(),
            }
        )
        vectors.append(vec)

    df = pd.DataFrame(data)
    X = np.vstack(vectors)
    print(f"Loaded {len(df)} tracks.")

    # 1. Compute Pairwise Cosine Distances once
    print("Computing pairwise distance matrix...")
    dist_matrix = cosine_distances(X)

    # 2. Determine target distance via binary search
    effective_max_dist = find_largest_safe_threshold(
        dist_matrix=dist_matrix,
        max_cluster_size=max_cluster_size,
        min_degree=min_degree,
        low=0,
        high=1,
        iterations=search_iterations,
    )

    # 3. Find Connected Components at target distance
    all_components = get_components(
        dist_matrix, effective_max_dist, min_degree=min_degree
    )

    # Filter components matching the desired size window
    clusters = []
    for component in all_components:
        if min_cluster_size <= len(component) <= max_cluster_size:
            sub_dist = dist_matrix[np.ix_(component, component)]
            triu_idx = np.triu_indices(len(component), k=1)
            mean_internal_dist = (
                float(np.mean(sub_dist[triu_idx])) if len(triu_idx[0]) > 0 else 0.0
            )

            clusters.append(
                {
                    "indices": component,
                    "size": len(component),
                    "mean_distance": mean_internal_dist,
                }
            )

    # Sort clusters by internal tightness (lowest distance first)
    clusters = sorted(clusters, key=lambda c: c["mean_distance"])

    print("=" * 95)
    print(
        f"🌱 DISCOVERED ORGANIC CLIQUES (Distance: {effective_max_dist:.4f} | "
        f"Size window: {min_cluster_size}-{max_cluster_size} | min_degree: {min_degree})"
    )
    print(f"Total qualifying clusters found: {len(clusters)}")
    print("=" * 95)

    for idx, cl in enumerate(clusters, 1):
        c_indices = cl["indices"]
        sub_dist = dist_matrix[np.ix_(c_indices, c_indices)]

        # Mean distance from each track to all other tracks in this cluster
        n_members = len(c_indices)
        if n_members > 1:
            track_mean_dists = sub_dist.sum(axis=1) / (n_members - 1)
        else:
            track_mean_dists = np.zeros(1)

        c_df = df.iloc[c_indices].copy()
        c_df["mean_dist"] = track_mean_dists
        c_df = c_df.sort_values(by="mean_dist", ascending=True)

        mood_counts = dict(c_df["mood"].value_counts())
        mood_str = ", ".join(f"{k}: {v}" for k, v in mood_counts.items())

        print(
            f"\n🔮 CLUSTER #{idx} (Size: {cl['size']} | Avg Dist: {cl['mean_distance']:.4f})"
        )
        print(f"   Label distribution: {mood_str}")
        print("   " + "-" * 90)
        for rank, (_, song) in enumerate(c_df.iterrows(), 1):
            role = (
                "⭐ CORE"
                if rank == 1
                else ("⚠️ EDGE" if rank == len(c_df) else "      ")
            )
            print(
                f"   • {role} [{song['mood']:<11}] (d={song['mean_dist']:.4f}) {song['title']}"
            )

    print("\n" + "=" * 95 + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Discover organic clusters from embeddings"
    )
    parser.add_argument(
        "--vector-col",
        type=str,
        default="musical_embedding",
        help="Column to pull embeddings from.",
    )
    parser.add_argument(
        "--min-size",
        type=int,
        default=6,
        help="Minimum number of songs to form a cluster.",
    )
    parser.add_argument(
        "--max-size",
        type=int,
        default=250,
        help="Maximum cluster size before percolation.",
    )
    parser.add_argument(
        "--min-degree",
        type=int,
        default=1,
        help="Minimum neighbors within threshold (1 = standard connected components).",
    )
    parser.add_argument(
        "--iterations",
        type=int,
        default=15,
        help="Number of binary search bisection steps.",
    )
    args = parser.parse_args()

    discover_clusters(
        vector_column=args.vector_col,
        min_cluster_size=args.min_size,
        max_cluster_size=args.max_size,
        min_degree=args.min_degree,
        search_iterations=args.iterations,
    )
