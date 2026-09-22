CREATE TABLE nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filepath   TEXT UNIQUE NOT NULL,

    title        TEXT,
    artist       TEXT,
    album        TEXT,
    mood varchar(20),

    musical_embedding vector(1024),
    cluster_id INTEGER,
    features jsonb,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);