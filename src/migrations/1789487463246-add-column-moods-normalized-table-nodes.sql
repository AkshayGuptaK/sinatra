ALTER TABLE nodes 
ADD COLUMN mood_vector_normalized vector(24),
ADD COLUMN moods_normalized jsonb;