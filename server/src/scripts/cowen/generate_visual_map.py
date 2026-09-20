from pathlib import Path
import pandas as pd
import plotly.express as px
from src.config import config

COORDS_CSV = config["project_root"] / "datasets" / "cowen_2d_coords.csv"
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


def generate_interactive_map():
    if not COORDS_CSV.exists():
        print(f"Error: {COORDS_CSV} not found. Run your projection script first.")
        return

    print(f"Reading precomputed coordinates from {COORDS_CSV}...")
    df = pd.read_csv(COORDS_CSV)

    df["audio_rel_url"] = "audio_cache/" + df["filename"]
    df["hover_desc"] = df.apply(build_hover_text, axis=1)

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

    fig.update_traces(
        marker=dict(size=7, opacity=0.85),
        hovertemplate="%{customdata[1]}<extra></extra>",
    )

    # Injected vanilla JS: plays audio clip on hover after first interaction
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
                console.log("Audio waiting for first user click interaction.");
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
