CREATE TABLE tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type varchar(20) DEFAULT 'local' NOT NULL,
    source_id text NOT NULL,

    title        TEXT,
    artist       TEXT,
    album        TEXT,

    tags TEXT[] NOT NULL DEFAULT '{}',
    duration DOUBLE PRECISION DEFAULT 0.0,
    acoustic_embedding vector(1024),

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT tracks_source_key UNIQUE (source_type, source_id);
);