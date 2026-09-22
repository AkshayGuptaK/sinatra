ALTER TABLE nodes 
ADD COLUMN emotion_vector_normalized vector(24),
ADD COLUMN emotions_normalized jsonb;