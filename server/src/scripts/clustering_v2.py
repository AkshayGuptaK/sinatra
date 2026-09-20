import numpy as np
from sklearn.preprocessing import normalize
from sklearn.decomposition import PCA
from sklearn.cluster import HDBSCAN
from src.pg import get_pg

def perform_clustering():
    db = get_pg()
    
    print("⏳ Fetching embeddings...", flush=True)
    with db.conn.cursor() as cur:
        cur.execute("SELECT id, musical_embedding FROM nodes WHERE musical_embedding IS NOT NULL")
        rows = cur.fetchall()

    if not rows:
        return

    ids = [r[0] for r in rows]
    
    # 1. Parse Strings to Numpy
    raw_embeddings = np.array([
        np.fromstring(r[1].strip("[]"), sep=",", dtype="float32") 
        for r in rows
    ])

    # 2. Normalize (Cosine Similarity Prep)
    print("🧠 Normalizing vectors...", flush=True)
    norm_embeddings = normalize(raw_embeddings)

    # 3. PCA: Dimensionality Reduction
    # Instead of UMAP, we use PCA to drop from 1024 dims -> 50 dims.
    # This keeps the most important "structural" variance (Genre, Tempo, Mood)
    # while removing noise, making HDBSCAN much faster.
    print("📉 Reducing Dimensions (PCA)...", flush=True)
    pca = PCA(n_components=50, random_state=42)
    reduced_data = pca.fit_transform(norm_embeddings)
    
    # Explain how much "signal" we kept
    variance_kept = np.sum(pca.explained_variance_ratio_)
    print(f"   (PCA kept {variance_kept:.1%} of the musical variance)")

    # 4. HDBSCAN: Density Clustering
    print("🔍 Finding Density Clusters (sklearn.HDBSCAN)...", flush=True)
    clusterer = HDBSCAN(
        min_cluster_size=15,
        min_samples=3,
        metric='euclidean',
        store_centers='centroid',
        cluster_selection_method='leaf',       
        n_jobs=-1
    )
    labels = clusterer.fit_predict(reduced_data)

    # 5. Stats
    # In sklearn, noise is labeled as -1
    unique_labels = set(labels)
    num_clusters = len(unique_labels) - (1 if -1 in unique_labels else 0)
    num_noise = list(labels).count(-1)
    
    print(f"✅ Found {num_clusters} stable clusters.")
    print(f"🗑️  Discarded {num_noise} songs as 'noise'.")

    # 6. Save to DB (Same as before)
    print("💾 Saving...", flush=True)
    update_data = list(zip([int(l) for l in labels], ids))

    with db.conn.cursor() as cur:
        cur.execute("CREATE TEMP TABLE tmp_clusters (cluster_id int, node_id uuid)")
        
        with cur.copy("COPY tmp_clusters (cluster_id, node_id) FROM STDIN") as copy:
            for cluster_id, node_id in update_data:
                copy.write_row((cluster_id, node_id))
        
        cur.execute("""
            UPDATE nodes 
            SET cluster_id = tmp_clusters.cluster_id 
            FROM tmp_clusters 
            WHERE nodes.id = tmp_clusters.node_id
        """)
        cur.execute("DROP TABLE tmp_clusters")
    
    db.conn.commit()

if __name__ == "__main__":
    perform_clustering()
