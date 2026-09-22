import numpy as np
import seaborn as sns
import matplotlib.pyplot as plt
from sklearn.metrics.pairwise import cosine_similarity
from src.pg import get_pg

def compare_fruits():
    db = get_pg()
    
    # Define the "Triangle of Confusion"
    fruits = {
        "Starfruit": "Instrumental Upbeat",
        "Pineapple": "Vocal Upbeat",     # Control for Energy
        "Sugarcane": "Instrumental Calm" # Control for Vocals
    }
    
    vectors = {}
    print("⏳ Fetching Fruit Vectors...")
    
    with db.conn.cursor() as cur:
        for fruit, desc in fruits.items():
            cur.execute(
                "SELECT musical_embedding FROM nodes WHERE mood = %s AND musical_embedding IS NOT NULL LIMIT 100", 
                (fruit,)
            )
            rows = cur.fetchall()
                
            # Parse
            vecs = np.array([np.fromstring(r[0].strip("[]"), sep=",", dtype="float32") for r in rows])
            vectors[fruit] = vecs
            print(f"   Loaded {len(vecs)} {fruit} tracks ({desc})")

    # 1. Calculate Centroids
    centroids = {k: np.mean(v, axis=0).reshape(1, -1) for k, v in vectors.items()}
    
    # 2. Cross-Similarity Matrix (How close are the genres?)
    print("\n🌐 CROSS-GENRE SIMILARITY (0.0 = Different, 1.0 = Same)")
    print(f"{'':12} | {'Starfruit':10} | {'Pineapple':10} | {'Sugarcane':10}")
    print("-" * 50)
    
    for row_fruit in ["Starfruit", "Pineapple", "Sugarcane"]:
        if row_fruit not in centroids: continue
        
        row_str = f"{row_fruit:12} | "
        for col_fruit in ["Starfruit", "Pineapple", "Sugarcane"]:
            if col_fruit not in centroids: 
                row_str += f"{'N/A':10} | "
                continue
            
            # Compare Centroid of Row vs Centroid of Col
            sim = cosine_similarity(centroids[row_fruit], centroids[col_fruit])[0][0]
            
            # formatting: highlight the problematic high overlaps
            val_str = f"{sim:.4f}"
            if row_fruit != col_fruit and sim > 0.95:
                val_str += " ⚠️" 
            row_str += f"{val_str:10} | "
        print(row_str)

    # 3. Distribution Plot (Visual Proof)
    # We want to see if Starfruit is closer to Pineapple (Vocal issue) or Sugarcane (Tempo issue)
    
    plt.figure(figsize=(10, 6))
    
    # Compare Starfruit songs to Pineapple Centroid
    sf_to_pine = cosine_similarity(vectors["Starfruit"], centroids["Pineapple"]).flatten()
    sns.kdeplot(sf_to_pine, label="Starfruit vs Pineapple (Vocals)", fill=True, alpha=0.3)
    
    # Compare Starfruit songs to Sugarcane Centroid
    sf_to_sugar = cosine_similarity(vectors["Starfruit"], centroids["Sugarcane"]).flatten()
    sns.kdeplot(sf_to_sugar, label="Starfruit vs Sugarcane (Tempo)", fill=True, alpha=0.3)
    
    # Compare Starfruit to ITSELF (Baseline)
    sf_to_sf = cosine_similarity(vectors["Starfruit"], centroids["Starfruit"]).flatten()
    sns.kdeplot(sf_to_sf, label="Starfruit vs Itself", color="green", linewidth=2)
    
    plt.title("Why is Starfruit Confused?")
    plt.xlabel("Cosine Similarity")
    plt.ylabel("Density")
    plt.legend()
    plt.show()

if __name__ == "__main__":
    compare_fruits()