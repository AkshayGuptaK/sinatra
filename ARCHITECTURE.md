# Architecture Reference: Sinatra

## 1. System Overview & Monorepo Layout

Sinatra is an intelligent desktop music player and affective MIR (Music Information Retrieval) engine. The client is a desktop UI built with SvelteKit and Tauri v2, while the backend is an asynchronous Python service driven by FastAPI, PyTorch, and PostgreSQL (`pgvector` / `pg_trgm`).

```text
.
├── Makefile
├── player/                     # Desktop Frontend (Tauri v2 + SvelteKit + Vite)
│   ├── src/                    # Svelte 5 runes, stores, canvas, API clients
│   ├── src-tauri/              # Rust Tauri shell configuration & capabilities
│   ├── package.json            # Managed with pnpm
│   └── vite.config.js
└── server/                     # Backend MIR & Streaming Server
    ├── datasets/               # Reference datasets (e.g., Cowen 2020 emotional ratings)
    ├── models/                 # Serialized projection pipelines & Ridge weights
    ├── pyproject.toml          # Managed with uv (Python 3.12)
    └── src/
        ├── main.py             # Server bootstrapper & FastAPI app instance
        ├── api/                # HTTP routes (streaming, metadata, tags, auto-dj)
        ├── models/             # PyTorch models & inference wrappers (MERT, Qwen)
        ├── pg.py               # Database connections & pgvector queries
        ├── scripts/            # Standalone analysis scripts & backfill tasks
        └── services/           # Audio playback logic, sync watchers, tag suggesters

```

- **Frontend Build System:** `pnpm` (`player/`).
- **Backend Runtime:** `uv run python -m src.main` (`server/`).
- **Client-Server IPC:** The frontend communicates with the backend exclusively via standard HTTP/Fetch APIs against `http://localhost:8000`.

---

## 2. Audio Decoding & Playback Pipeline

- **Client Audio Engine:** Webview HTML5 Audio pipeline managed by `player.svelte.ts`.

- **Streaming Protocol:** Tracks stream over HTTP via `/api/audio/{track_id}` serving native container formats (FLAC, MP3, M4A, etc.) through `FileResponse`.

- **Audio Ingestion Decoder:** Subprocess-driven FFmpeg pipe (`pipe:0`). The backend converts arbitrary container formats into raw PCM `float32` tensors directly in memory without writing intermediate files to disk.

---

## 3. Database Schema & Vector Storage (`nodes`)

PostgreSQL is the single source of truth for audio metadata, affective projections, and neural embeddings. Migrations are tracked via `schema_migrations`.

### PostgreSQL Schema: `public.nodes`

| Column | Type        | Description                                     |
| ------ | ----------- | ----------------------------------------------- |
| `id`   | `uuid` (PK) | Primary track identifier (`gen_random_uuid()`). |

|
| `filepath` | `text` (Unique) | Absolute filesystem path on local disk.

|
| `title` | `text` | Track title.

|
| `artist` | `text` | Contributing / primary artist.

|
| `album` | `text` | Album name.

|
| `duration` | `float8` | Track length in seconds (extracted via `mutagen`).

|
| `tags` | `text[]` | User tags and auto-suggested classification tags.

|
| `musical_embedding` | `vector(1024)` | Dense neural representation from `MERT-v2-30s`.

|
| `emotion_vector` | `vector(24)` | Unnormalized predicted Cowen emotional scores.

|
| `emotions` | `jsonb` | Key-value dictionary of unnormalized emotion probabilities.

|
| `emotion_vector_normalized` | `vector(24)` | L2-normalized 24D unit vector (pure affective mixture).

|
| `emotions_normalized` | `jsonb` | Key-value dictionary of normalized emotion probabilities.

|
| `semantic_embedding` | `vector(512)` | Dense multimodal audio embedding (LAION-CLAP). |
| `lyrics` | `text` | Raw lyrical text (scraped/cached via `syncedlyrics`).

|
| `lyrical_embedding` | `halfvec(2560)` | Semantic text embedding from `qwen3-embedding:4b`.

|
| `coord_x`, `coord_y` | `float8` | 2D projection coordinates for affective scatter canvas.

|
| `created_at` | `timestamptz` | Track insertion timestamp.

|
| `updated_at` | `timestamptz` | Last metadata or embedding update.

|

### Indexing Strategies

- **Lyrics Search:** Indexed via GIN trigram (`CREATE INDEX nodes_lyrics_trgm_idx ON nodes USING GIN (lyrics gin_trgm_ops);`). Enables sub-10ms substring and phrase lookups across the library without dictionary stopword interference.

- **Embedding Lookups:** `musical_embedding` and `lyrical_embedding` perform exact sequential scans across current library sizes (~2,000 tracks take under 5 ms on Apple Silicon). HNSW indexing using `vector_cosine_ops` remains optional for scale.

---

## 4. Feature Extraction & Machine Learning Topology

```text
Audio File on Disk
       │
       ▼ (FFmpeg PCM Pipe)
Raw Audio Waveform (24kHz Mono / 44.1kHz Stereo)
       │
       ▼
MERT-v2-30s Transformer (MPS / CUDA / CPU)
       │
       ▼
musical_embedding [1024-D]
       │
       ├─────────────────────────────────────────┐
       ▼                                         ▼
24 Ridge Probes (Trained on Cowen 2020)   Auto-Tag Suggester
       │                                  (Cosine / Linear Head)
       ▼
emotion_vector [24-D] ───(L2 Norm)───► emotion_vector_normalized [24-D]
       │
       ▼ (UMAP Model fitted on Cowen 2020 Manifold)
2D Coordinates (coord_x, coord_y)

```

1. **Hardware Detection:** Model inference prioritizes `mps` (Apple Silicon Metal), falls back to `cuda` if available, and defaults to `cpu`. Weights are read directly from the Hugging Face cache directory.
2. **Audio Embedding (`musical_embedding`):** Extracted using `MERT-v2-30s` over 30-second clips, yielding a 1024-dimensional continuous acoustic vector.

3. **Affective Scoring (`emotion_vector`):** Ridge regression heads fit on the Cowen dataset project 1024-D embeddings into Cowen's retained 24 dimensions (excluding non-generalizable somatic noise like _goose bumps_, _nauseating_, _painful_, and _entrancing_).

4. **Coordinate Manifold (`coord_x`, `coord_y`):** A pre-fitted parametric UMAP model maps the 24D unnormalized emotion vectors into 2D display coordinates.

5. **Lyrical Processing (`lyrical_embedding`):** Lyrical text retrieved by `syncedlyrics` is passed to local Ollama via `qwen3-embedding:4b` to yield a 2560-dimensional dense representation stored as `halfvec`.

---

## 5. Ingestion & Synchronization Lifecycles

- **Lifespan Hooks:** The FastAPI application lifespan (`@asynccontextmanager`) boots background tasks on startup.

- **File Watcher & Poller:** An in-process file watcher monitors the audio directory for added or modified files, backed by a periodic polling loop that reconciles un-indexed filesystem differences.
- **Full Synchronous Pipeline:** When a new file is detected, the background task reads tags via `mutagen`, computes duration, streams audio through FFmpeg, generates `musical_embedding`, scores emotions, projects UMAP coordinates, and upserts the track into PostgreSQL in a single pass.

- **Backfill Tooling:** Batch backfills are isolated under `server/src/scripts/backfill/` to recalculate individual columns (e.g., re-running lyric fetches, UMAP projections, or embedding migrations).

---

#### 6. Frontend Architecture & Design System

- **UI Framework:** SvelteKit utilizing Svelte 5 runes (`$state`, `$derived`, `$props`).

- **Design System & Styling:** Styled with Tailwind CSS and the `shadcn-svelte` component library (built over bits-ui/Radix primitives).

- **Component Architecture (Atomic Design):**

  - **Atoms:** Primitives and wrapped base components (`TextInput.svelte`, `ControlButton.svelte`, inline cells, badges).
  - **Molecules:** Composed UI units (`CommandBar.svelte`, `LibraryControls.svelte`, `TagEditorPopover.svelte`, `LibraryTrackItem.svelte`, `MapTooltip.svelte`).
  - **Organisms:** Major interactive standalone sections (`LibraryListView.svelte`, `LibraryMapView.svelte`, `Library.svelte`, `ActiveQueue.svelte`, `NowPlaying.svelte`).
  - **Templates:** Structural scaffolding layouts (`PlayerTemplate.svelte`) wireframing grid/flex placement.
  - **Pages:** Concrete routes (`src/routes/+page.svelte`) instantiating templates and binding page-level metadata.

- **Catalog State (`library.svelte.ts`):** Maintains the full library catalog in-memory (`Track[]`). Client-side evaluation handles instantaneous sorting and filtering over artist, album, tags, and duration.

- **Audio Player (`player.svelte.ts`):** Controls queue lifecycle, HTML5 playback, Auto DJ trigger events, and volume/seek state.

- **Settings Architecture (`settings.svelte.ts`, `settingsRegistry.ts`):** Declarative manifest defining typed options across categories (`Appearance`, `AutoDJ`, etc.) synced to persistent storage (`localStorage`). Domain subsystems pull reactive values on demand via `$derived` rather than executing imperative mutations inside the store.

- **Command Bar AST:** A recursive parser evaluates Omnibar commands (e.g., `:artist`, `:tag`, `:d > 3m`, `:lyrics`, `/dj`, `/q`, `/p`, and `/set <key> <val>`). Autocomplete hints and setting assignments derive dynamically from the centralized settings registry.

- **Interactive Map (`LibraryMapView.svelte`):** An HTML5 2D `<canvas>` controlled with `d3-zoom` renders library tracks based on `coord_x` and `coord_y`, color-coded by primary emotion cluster.
