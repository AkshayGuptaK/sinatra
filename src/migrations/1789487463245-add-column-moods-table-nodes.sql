ALTER TABLE nodes 
ADD COLUMN mood_vector vector(24),
ADD COLUMN moods jsonb;