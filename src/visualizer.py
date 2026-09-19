from pathlib import Path
from typing import Any, Dict, List
import numpy as np
from src.pg import get_pg

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

# The 13 core cluster archetypes for coloring
CORE_13_EMOTIONS = [
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


def fetch_library_path(track_id):
    db = get_pg()
    return db.get_track_path_by_id(track_id)


def fetch_library_map_points() -> List[Dict[str, Any]]:
    """Fetches all tracks having coordinates and formats data for client-side rendering."""
    db = get_pg()
    with db.conn.cursor() as cur:
        cur.execute(
            """
            SELECT id::text, filepath, title, artist, coord_x, coord_y, moods_normalized
            FROM nodes
            WHERE coord_x IS NOT NULL 
              AND coord_y IS NOT NULL 
              AND moods IS NOT NULL;
            """
        )
        rows = cur.fetchall()

    points = []
    for id, filepath, title, artist, cx, cy, moods_dict in rows:
        if not isinstance(moods_dict, dict):
            continue

        # 1. Determine dominant core emotion across the 13 categories
        core_scores = [float(moods_dict.get(m, 0.0)) for m in CORE_13_EMOTIONS]
        dominant = CORE_13_EMOTIONS[int(np.argmax(core_scores))]

        # 2. Extract and sort non-zero emotions for clean tooltips
        active_moods = [
            (mood, round(float(moods_dict.get(mood, 0.0)) * 100, 1))
            for mood in EMOTION_COLS
            if mood in moods_dict
            and round(float(moods_dict.get(mood, 0.0)) * 100, 1) > 0.0
        ]
        active_moods.sort(key=lambda item: item[1], reverse=True)

        display_name = title if title else Path(filepath).name

        # 3. Format HTML hover string
        hover_lines = [f"<b>{display_name}</b><br>"]
        for mood, pct in active_moods:
            hover_lines.append(f"{mood}: <b>{pct:.1f}%</b>")
        hover_html = "<br>".join(hover_lines)

        points.append(
            {
                "id": id,
                "filepath": filepath,
                "display_name": display_name,
                "x": round(float(cx), 4),
                "y": round(float(cy), 4),
                "dominant_emotion": dominant,
                "hover_html": hover_html,
            }
        )

    return points


def render_map_page_html() -> str:
    """Returns the single-page HTML client using Plotly.js to fetch data dynamically."""
    return """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Sinatra - Music Library Emotion Map</title>
    <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
    <style>
        body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background-color: #111217;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            overflow: hidden;
        }
        #chart {
            width: 100vw;
            height: 100vh;
        }
        #loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #eceff4;
            font-size: 1.2rem;
            letter-spacing: 0.05em;
        }
    </style>
</head>
<body>
    <div id="loading">Loading Sinatra Emotion Manifold...</div>
    <div id="chart"></div>

    <script>
    document.addEventListener("DOMContentLoaded", async () => {
        const loadingEl = document.getElementById("loading");
        const chartEl = document.getElementById("chart");
        let currentAudio = null;

        try {
            // 1. Fetch dynamic coordinates and tooltip data from FastAPI
            const res = await fetch("/api/map/data");
            const points = await res.json();
            loadingEl.style.display = "none";

            // Group points by dominant_emotion to form distinct Plotly traces
            const groups = {};
            points.forEach(pt => {
                if (!groups[pt.dominant_emotion]) {
                    groups[pt.dominant_emotion] = {
                        x: [], y: [], text: [], customdata: [], name: pt.dominant_emotion,
                        mode: 'markers', type: 'scatter', marker: { size: 7, opacity: 0.85 }
                    };
                }
                groups[pt.dominant_emotion].x.push(pt.x);
                groups[pt.dominant_emotion].y.push(pt.y);
                groups[pt.dominant_emotion].text.push(pt.hover_html);
                groups[pt.dominant_emotion].customdata.push(pt.id);
            });

            const traces = Object.values(groups);

            const layout = {
                title: "Sinatra 2D Emotion Manifold (Personal Library)",
                template: "plotly_dark",
                paper_bgcolor: "#111217",
                plot_bgcolor: "#111217",
                hovermode: "closest",
                margin: { l: 40, r: 40, t: 60, b: 40 },
                xaxis: { showgrid: false, zeroline: false, showticklabels: false },
                yaxis: { showgrid: false, zeroline: false, showticklabels: false },
                legend: { orientation: "h", y: -0.05, x: 0.1 }
            };

            const config = {
                responsive: true,
                displaylogo: false,
                modeBarButtonsToRemove: ['lasso2d', 'select2d']
            };

            // Set hovertemplate to render the rich HTML string from text array
            traces.forEach(t => {
                t.hovertemplate = "%{text}<extra></extra>";
            });

            await Plotly.newPlot(chartEl, traces, layout, config);

            // 2. Playback on hover
            chartEl.on('plotly_hover', function(data) {
                const pt = data.points[0];
                if (!pt || !pt.customdata) return;
                const trackId = pt.customdata;
                const streamUrl = `/api/map/audio/${encodeURIComponent(trackId)}`;

                if (currentAudio) {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                }

                currentAudio = new Audio(streamUrl);
                currentAudio.play().catch(err => {
                    // Requires an initial click anywhere on the page
                    console.debug("Autoplay waiting for initial page interaction");
                });
            });

            chartEl.on('plotly_unhover', function() {
                if (currentAudio) {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                }
            });

        } catch (err) {
            loadingEl.textContent = "Failed to load library emotion map.";
            console.error(err);
        }
    });
    </script>
</body>
</html>
"""
