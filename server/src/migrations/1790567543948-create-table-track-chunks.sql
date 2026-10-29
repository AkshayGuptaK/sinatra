CREATE TABLE track_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    
    start_sec FLOAT8 NOT NULL,
    end_sec FLOAT8 NOT NULL,
    
    musical_embedding vector(1024) NOT NULL,
    
    emotions JSONB,
    emotion_vector vector(24),
    emotions_normalized JSONB,
    emotion_vector_normalized vector(24),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_track_chunk_start UNIQUE (track_id, start_sec);
);