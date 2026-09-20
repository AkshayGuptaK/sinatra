import numpy as np
from sklearn.cluster import KMeans
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import normalize
from src.pg import get_pg


def perform_clustering(n_clusters=30):
    db = get_pg()

    print("⏳ Fetching embeddings...", flush=True)
    with db.conn.cursor() as cur:
        cur.execute(
            "SELECT id, musical_embedding FROM nodes WHERE musical_embedding IS NOT NULL"
        )
        rows = cur.fetchall()

    if not rows:
        print("No embeddings found.")
        return

    ids = [r[0] for r in rows]
    embeddings = np.array(
        [np.fromstring(r[1].strip("[]"), sep=",", dtype="float32") for r in rows]
    )
    normalized_data = normalize(embeddings)

    print(f"🔢 Clustering into {n_clusters} groups...", flush=True)

    gmm = GaussianMixture(n_components=30, covariance_type='full', random_state=42)
    labels = gmm.fit_predict(normalized_data)
    # kmeans = KMeans(n_clusters=n_clusters, init="k-means++", n_init=10, random_state=42)
    # kmeans.fit(normalized_data)
    # labels = kmeans.labels_

    print("💾 Saving clusters to DB...", flush=True)

    update_data = list(zip(labels.tolist(), ids))

    with db.conn.cursor() as cur:
        # Bulk Update using a temporary table for speed
        cur.execute("CREATE TEMP TABLE tmp_clusters (cluster_id int, node_id uuid)")

        with cur.copy("COPY tmp_clusters (cluster_id, node_id) FROM STDIN") as copy:
            for cluster_id, node_id in update_data:
                copy.write_row((cluster_id, node_id))

        cur.execute(
            """
            UPDATE nodes 
            SET cluster_id = tmp_clusters.cluster_id 
            FROM tmp_clusters 
            WHERE nodes.id = tmp_clusters.node_id
        """
        )

        cur.execute("DROP TABLE tmp_clusters")

    db.conn.commit()
    print("✅ Clustering Complete.")


if __name__ == "__main__":
    perform_clustering()
