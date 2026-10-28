CREATE TABLE track_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    chunk_index INT4 NOT NULL,
    
    start_sec FLOAT8 NOT NULL,
    end_sec FLOAT8 NOT NULL,
    
    musical_embedding vector(1024) NOT NULL,
    
    emotions JSONB,
    emotion_vector vector(24),
    emotions_normalized JSONB,
    emotion_vector_normalized vector(24),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_track_chunk_index UNIQUE (track_id, chunk_index)
);