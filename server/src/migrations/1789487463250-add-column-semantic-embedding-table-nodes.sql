ALTER TABLE nodes 
ADD COLUMN IF NOT EXISTS semantic_embedding vector(512);