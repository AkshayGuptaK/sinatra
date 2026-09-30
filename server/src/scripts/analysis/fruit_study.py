import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from src.pg import get_pg


def analyze_fruit():
    db = get_pg()
    TARGET_MOOD = "Pineapple"

    print(f"Studying the acoustics of '{TARGET_MOOD}'...")

    with db.conn.cursor() as cur:
        cur.execute(
            "SELECT id, filepath, musical_embedding FROM nodes WHERE mood = %s AND musical_embedding IS NOT NULL",
            (TARGET_MOOD,),
        )
        fruit_rows = cur.fetchall()

        cur.execute(
            "SELECT id, filepath, musical_embedding FROM nodes WHERE mood != %s AND mood IS NOT NULL AND musical_embedding IS NOT NULL ORDER BY RANDOM() LIMIT 500",
            (TARGET_MOOD,),
        )
        noise_rows = cur.fetchall()

    # Parse Vectors
    fruit_vecs = np.array(
        [np.fromstring(r[2].strip("[]"), sep=",", dtype="float32") for r in fruit_rows]
    )
    fruit_paths = [r[1] for r in fruit_rows]

    noise_vecs = np.array(
        [np.fromstring(r[2].strip("[]"), sep=",", dtype="float32") for r in noise_rows]
    )

    # --- METRIC 1: INTRA-CLUSTER (Coherence) ---
    # Similarity of Fruit vs Itself
    intra_sim_matrix = cosine_similarity(fruit_vecs)
    # We remove the diagonal (1.0) because a song is always identical to itself
    np.fill_diagonal(intra_sim_matrix, np.nan)

    avg_intra = np.nanmean(intra_sim_matrix)
    median_intra = np.nanmedian(intra_sim_matrix)

    print(f"\nCOHERENCE STATISTICS")
    print(f"   Songs in Cluster: {len(fruit_vecs)}")
    print(f"   Avg Similarity:   {avg_intra:.4f} (Higher is tighter)")
    print(f"   Median Similarity:{median_intra:.4f}")

    # --- METRIC 2: INTER-CLUSTER (Distinctiveness) ---
    # Similarity of Fruit vs Noise
    if len(noise_vecs) > 0:
        inter_sim_matrix = cosine_similarity(fruit_vecs, noise_vecs)
        avg_inter = np.mean(inter_sim_matrix)

        distinctiveness = avg_intra - avg_inter
        print(f"   Avg vs. Others:   {avg_inter:.4f} (Lower is more unique)")
        print(f"   Distinctiveness:  {distinctiveness:.4f} (Gap size)")

    # --- METRIC 3: CENTROID ANALYSIS ---
    # The centroid is the mean vector of the entire cluster
    centroid = np.mean(fruit_vecs, axis=0).reshape(1, -1)

    # Distances from centroid to every fruit song
    # Note: We use cosine similarity to centroid
    dists_to_center = cosine_similarity(fruit_vecs, centroid).flatten()

    # Get indices of sorted distances
    sorted_indices = np.argsort(dists_to_center)  # Ascending (Low sim -> High sim)

    print(f"\nARCHETYPE ANALYSIS")

    # Highest Similarity to Center = The Ultimate Fruit Song
    best_idx = sorted_indices[-1]
    print(f"   The 'Platonic Ideal' (Closest to center):")
    print(
        f"    {fruit_paths[best_idx].split('/')[-1]} (Score: {dists_to_center[best_idx]:.4f})"
    )

    # Lowest Similarity = The Outlier
    worst_idx = sorted_indices[0]
    print(f"   The 'Edge Case' (Furthest from center):")
    print(
        f"    {fruit_paths[worst_idx].split('/')[-1]} (Score: {dists_to_center[worst_idx]:.4f})"
    )

    # --- METRIC 4: NEIGHBOR CONSISTENCY (The AutoDJ Test) ---
    # Combine all vectors to build a search space
    all_vecs = np.vstack([fruit_vecs, noise_vecs])
    all_labels = np.array(
        [1] * len(fruit_vecs) + [0] * len(noise_vecs)
    )  # 1=Fruit, 0=Noise

    # Calculate pairwise for specific fruit songs against EVERYONE
    # This checks: If I play a fruit song, are the closest songs also the same fruit?
    print(f"\nAUTODJ PREDICTION SCORE")

    full_matrix = cosine_similarity(fruit_vecs, all_vecs)

    k = 5
    correct_neighbors = 0
    total_neighbors = 0

    for i in range(len(fruit_vecs)):
        # Get distances for this song
        sims = full_matrix[i]
        # Sort desc, ignore index i (itself)
        # Note: We must adjust index because 'i' in fruit_vecs corresponds to 'i' in all_vecs
        sims[i] = -1.0

        # Get top K indices
        top_k_indices = np.argsort(sims)[-k:]

        # Check how many are target mood (label 1)
        matches = np.sum(all_labels[top_k_indices])
        correct_neighbors += matches
        total_neighbors += k

    accuracy = correct_neighbors / total_neighbors
    print(f"   If you play a {TARGET_MOOD} song, the next {k} recommendations")
    print(f"   will be correct {accuracy:.1%} of the time.")


if __name__ == "__main__":
    analyze_fruit()
