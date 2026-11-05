ALTER TABLE tracks 
ADD COLUMN IF NOT EXISTS lyrics TEXT,
ADD COLUMN IF NOT EXISTS lyrical_embedding halfvec(2560),
ADD COLUMN IF NOT EXISTS lyrical_emotion_vector public.vector(11) NULL,
ADD COLUMN IF NOT EXISTS lyrical_emotions jsonb NULL,
ADD COLUMN IF NOT EXISTS lyrical_emotion_coords point NULL;