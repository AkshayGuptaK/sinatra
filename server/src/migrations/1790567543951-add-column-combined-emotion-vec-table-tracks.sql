ALTER TABLE tracks
    ADD COLUMN combined_emotion_vector public.vector(35) GENERATED ALWAYS AS (
        CASE
            WHEN acoustic_emotion_vector IS NULL THEN NULL
            ELSE (
                acoustic_emotion_vector::real[] ||
                COALESCE(
                    lyrical_emotion_vector::real[],
                    ARRAY_FILL(0.0::real, ARRAY[11])
                )
            )::public.vector(35)
        END
    ) STORED;