from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.manifold import TSNE
import plotly.express as px
from src.config import config

PARQUET_PATH = config["project_root"] / "datasets" / "cowen.parquet"
OUTPUT_HTML = config["project_root"] / "datasets" / "cowen_map_replicated.html"

# The 24 retained high-signal dimensions
EMOTION_COLS = [
    "amusing",
    "angry",
    "annoying",
    "anxious/tense",
    "awe-inspiring/amazing",
    "beautiful",
    "bittersweet",
    "calm/relaxing/serene",
    "compassionate/sympathetic",
    "dreamy",
    "eerie/mysterious",
    "energizing/pump-up",
    "erotic/desirous",
    "euphoric/ecstatic",
    "exciting",
    "indignant/defiant",
    "joyful/cheerful",
    "proud/strong",
    "romantic/loving",
    "sad/depressing",
    "scary/fearful",
    "tender/longing",
    "transcendent/mystical",
    "triumphant/heroic",
]

# As per the Cowen paper, only 13 emotions are truly orthogonal
CORE_EMOTIONS = [
    "amusing",
    "angry",
    "annoying",
    "anxious/tense",
    "beautiful",
    "calm/relaxing/serene",
    "dreamy",
    "energizing/pump-up",
    "erotic/desirous",
    "indignant/defiant",
    "joyful/cheerful",
    "sad/depressing",
    "scary/fearful",
]

def build_hover_text(row: pd.Series) -> str:
    """Formats all 24 emotion scores into a sorted, scannable HTML tooltip."""
    scores = [
        (mood, row[mood]) for mood in EMOTION_COLS if round(row[mood] * 100, 1) > 0.0
    ]
    # Sort descending by score to highlight dominant traits first
    scores.sort(key=lambda x: x[1], reverse=True)

    lines = [f"<b>{row['row_id']}</b><br>"]
    for mood, val in scores:
        lines.append(f"{mood}: <b>{val * 100:.1f}%</b>")
    return "<br>".join(lines)


def load_and_project() -> pd.DataFrame:
    print(f"Reading {PARQUET_PATH}...")
    df = pd.read_parquet(PARQUET_PATH)

    df["row_id"] = np.arange(1, len(df) + 1)

    def get_audio_filename(entry):
        if isinstance(entry, dict) and entry.get("path"):
            return Path(entry["path"]).name
        return ""

    df["filename"] = df["audio"].apply(get_audio_filename)
    df["audio_rel_url"] = "audio_cache/" + df["filename"]

    # Build formatted tooltip string containing all 24 emotions
    df["hover_desc"] = df.apply(build_hover_text, axis=1)

    X = df[EMOTION_COLS].to_numpy(dtype=np.float64)

    print(f"Running t-SNE over {len(df)} samples across 24 emotions...")
    tsne = TSNE(
        n_components=2,
        metric="correlation",
        perplexity=50,
        learning_rate=500.0,
        max_iter=3000,
        random_state=42,
    )
    coords = tsne.fit_transform(X)

    df["map_x"] = coords[:, 0]
    df["map_y"] = coords[:, 1]
    
    X_13 = df[CORE_EMOTIONS].to_numpy(dtype=np.float64)
    df["dominant_emotion"] = [CORE_EMOTIONS[i] for i in np.argmax(X_13, axis=1)]

    return df


def generate_interactive_map():
    df = load_and_project()

    # Pass audio_rel_url and formatted hover text into custom_data
    fig = px.scatter(
        df,
        x="map_x",
        y="map_y",
        color="dominant_emotion",
        custom_data=["audio_rel_url", "hover_desc"],
        template="plotly_dark",
        width=1300,
        height=900,
        title="Cowen 2D Music Emotion Manifold",
    )

    # %{customdata[1]} injects the 24-emotion breakdown; <extra></extra> strips trace headers
    fig.update_traces(
        marker=dict(size=7, opacity=0.85),
        hovertemplate="%{customdata[1]}<extra></extra>",
    )

    audio_hover_js = """
    <script>
    document.addEventListener("DOMContentLoaded", function () {
        const plotEl = document.getElementsByClassName('plotly-graph-div')[0];
        let currentAudio = null;

        plotEl.on('plotly_hover', function(data){
            const point = data.points[0];
            if (!point || !point.customdata) return;
            const audioSrc = point.customdata[0];
            if (!audioSrc) return;

            if (currentAudio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
            }

            currentAudio = new Audio(audioSrc);
            currentAudio.play().catch(e => {
                console.log("Waiting for user interaction before playing audio.");
            });
        });

        plotEl.on('plotly_unhover', function(){
            if (currentAudio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
            }
        });
    });
    </script>
    """

    html_content = fig.to_html(include_plotlyjs="cdn")
    full_html = html_content.replace("</body>", f"{audio_hover_js}</body>")

    OUTPUT_HTML.write_text(full_html, encoding="utf-8")
    print(f"Generated interactive map at: {OUTPUT_HTML}")


if __name__ == "__main__":
    generate_interactive_map()
