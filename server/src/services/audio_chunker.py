from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Union
import librosa
import numpy as np

from src.sources import FileSystemSource


@dataclass
class AudioChunk:
    """Represents a single structural chapter of an audio track."""

    index: int
    start_sec: float
    end_sec: float
    duration: float
    waveform: np.ndarray  # 1D float32 numpy array ready for MERT (10s to 15s)
    crop_start_sec: float
    crop_end_sec: float


@dataclass
class ChunkedTrack:
    """Contains the overall track metadata and its extracted structural chunks."""

    filepath: str
    total_duration: float
    chunks: list[AudioChunk]


class AudioChunker:
    """Segments tracks into natural structural chapters using fast DSP

    (MFCC + Chroma) and extracts representative 10-15s waveform crops.
    """

    def __init__(
        self,
        sample_rate: int = 24000,
        hop_length: int = 2048,
        min_seg_sec: float = 10.0,
        crop_sec: float = 15.0,
        similarity_merge_threshold: float = 0.98,
    ):
        self.sample_rate = sample_rate
        self.hop_length = hop_length
        self.min_seg_sec = min_seg_sec
        self.crop_sec = crop_sec
        self.similarity_merge_threshold = similarity_merge_threshold

    def chunk(
        self,
        filepath: Union[str, Path],
        waveform: Optional[np.ndarray] = None,
    ) -> ChunkedTrack:
        """Loads audio (if not pre-loaded), segments into structural chapters,

        and returns the waveforms and timestamps for each chunk.
        """
        filepath_str = str(filepath)

        # 1. Decode Audio if not provided
        if waveform is None:
            raw_audio = FileSystemSource.read_file(filepath_str, self.sample_rate, 1)
            if hasattr(raw_audio, "numpy"):
                raw_audio = raw_audio.numpy()
            waveform = np.asarray(raw_audio, dtype=np.float32).squeeze()

        total_samples = waveform.shape[0]
        total_sec = total_samples / self.sample_rate

        # 2. Edge Case: Track is shorter than minimum crop threshold
        if total_sec <= self.crop_sec:
            single_chunk = AudioChunk(
                index=0,
                start_sec=0.0,
                end_sec=total_sec,
                duration=total_sec,
                waveform=waveform.copy(),
                crop_start_sec=0.0,
                crop_end_sec=total_sec,
            )
            return ChunkedTrack(
                filepath=filepath_str,
                total_duration=total_sec,
                chunks=[single_chunk],
            )

        # 3. Detect Structural Boundaries (DSP)
        sections = self._detect_sections(waveform, total_sec)

        # 4. Extract Representative Waveform Crops
        chunks: list[AudioChunk] = []
        for idx, (s_start, s_end) in enumerate(sections):
            sec_dur = s_end - s_start

            if sec_dur <= self.crop_sec:
                # Section is between 10s and 15s: take whole section unpadded
                crop_start = s_start
                crop_end = s_end
            else:
                # Center-crop 15s inside the section
                mid = (s_start + s_end) / 2.0
                crop_start = mid - (self.crop_sec / 2.0)
                crop_end = crop_start + self.crop_sec

            c_start_sample = max(0, int(crop_start * self.sample_rate))
            c_end_sample = min(total_samples, int(crop_end * self.sample_rate))
            chunk_wave = waveform[c_start_sample:c_end_sample].copy()

            chunks.append(
                AudioChunk(
                    index=idx,
                    start_sec=round(s_start, 2),
                    end_sec=round(s_end, 2),
                    duration=round(sec_dur, 2),
                    waveform=chunk_wave,
                    crop_start_sec=round(crop_start, 2),
                    crop_end_sec=round(crop_end, 2),
                )
            )

        return ChunkedTrack(
            filepath=filepath_str,
            total_duration=round(total_sec, 2),
            chunks=chunks,
        )

    def _detect_sections(
        self, waveform: np.ndarray, total_sec: float
    ) -> list[tuple[float, float]]:
        """Segments audio into chapters using MFCC + Chroma with similarity merging."""
        # Feature Extraction: Timbre (12 MFCC) + Harmony (12 Chroma)
        mfcc = librosa.feature.mfcc(
            y=waveform,
            sr=self.sample_rate,
            n_mfcc=12,
            hop_length=self.hop_length,
        )
        chroma = librosa.feature.chroma_stft(
            y=waveform,
            sr=self.sample_rate,
            hop_length=self.hop_length,
            n_chroma=12,
        )

        mfcc_norm = librosa.util.normalize(mfcc, axis=1)
        chroma_norm = librosa.util.normalize(chroma, axis=1)
        features = np.vstack([mfcc_norm, chroma_norm])

        # Dynamic cluster budget: ~1 split every 35-40s
        max_candidates = int(np.clip(round(total_sec / 35.0), 3, 8))

        # Constrained Agglomerative Clustering
        bound_frames = librosa.segment.agglomerative(features, k=max_candidates)
        bound_times = librosa.frames_to_time(
            bound_frames, sr=self.sample_rate, hop_length=self.hop_length
        )
        raw_cuts = sorted(list(set([0.0] + list(bound_times) + [total_sec])))

        # Filter micro-segments (< min_seg_sec)
        filtered_cuts = [raw_cuts[0]]
        for cut in raw_cuts[1:]:
            if (cut - filtered_cuts[-1]) >= self.min_seg_sec:
                filtered_cuts.append(cut)
            else:
                filtered_cuts[-1] = cut

        if filtered_cuts[-1] < total_sec:
            filtered_cuts[-1] = total_sec

        cand_sections = [
            (filtered_cuts[i], filtered_cuts[i + 1])
            for i in range(len(filtered_cuts) - 1)
        ]

        if len(cand_sections) <= 1:
            return cand_sections

        # Merge acoustically redundant neighbors (> similarity_merge_threshold)
        fps = self.sample_rate / self.hop_length
        section_vectors = []
        for start, end in cand_sections:
            f_start = int(start * fps)
            f_end = max(f_start + 1, int(end * fps))
            sec_mean = np.mean(features[:, f_start:f_end], axis=1)
            section_vectors.append(sec_mean / (np.linalg.norm(sec_mean) + 1e-8))

        merged_sections = [cand_sections[0]]
        current_vec = section_vectors[0]

        for i in range(1, len(cand_sections)):
            sim = float(np.dot(current_vec, section_vectors[i]))
            if sim >= self.similarity_merge_threshold:
                prev_start, _ = merged_sections[-1]
                merged_sections[-1] = (prev_start, cand_sections[i][1])
                dur_prev = merged_sections[-1][1] - prev_start
                dur_curr = cand_sections[i][1] - cand_sections[i][0]
                current_vec = (
                    current_vec * dur_prev + section_vectors[i] * dur_curr
                ) / (dur_prev + dur_curr)
                current_vec /= np.linalg.norm(current_vec) + 1e-8
            else:
                merged_sections.append(cand_sections[i])
                current_vec = section_vectors[i]

        return merged_sections


_chunker_instance: Optional[AudioChunker] = None


def get_audio_chunker() -> AudioChunker:
    """Returns the singleton AudioChunker instance."""
    global _chunker_instance
    if _chunker_instance is None:
        _chunker_instance = AudioChunker()
    return _chunker_instance
