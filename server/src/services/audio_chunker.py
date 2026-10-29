from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Union
import librosa
import numpy as np


@dataclass
class AudioChunk:
    index: int
    start_sec: float
    end_sec: float
    duration: float
    waveform: np.ndarray


@dataclass
class ChunkedTrack:
    filepath: str
    total_duration: float
    music_start: float
    music_end: float
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

    def trim_container_silence(
        self,
        waveform: np.ndarray,
        dither_threshold: float = 6e-5,
        min_continuous_ms: int = 50,  # 50ms of activity confirms recording has started
        lead_buffer_sec: float = 0.25,  # Keep 250ms of air before the sound
    ) -> tuple[np.ndarray, int, int]:
        """
        Safely strips only unrecorded container zero-padding and encoder lag.
        Guaranteed to preserve slow ambient fade-ins and stereo-widened pads.
        """
        # 1. Handle multi-channel without phase cancellation
        if waveform.ndim > 1:
            # Check maximum across any channel (Left or Right)
            abs_signal = np.max(np.abs(waveform), axis=0)
        else:
            abs_signal = np.abs(waveform)

        total_samples = abs_signal.shape[0]
        if total_samples == 0:
            return waveform, 0, 0

        # 2. Find blocks of true acoustic activity
        # Use 10ms blocks
        block_len = max(1, int(self.sample_rate * 0.010))
        n_blocks = total_samples // block_len
        if n_blocks == 0:
            return waveform, 0, total_samples

        block_peaks = (
            abs_signal[: n_blocks * block_len].reshape(n_blocks, block_len).max(axis=1)
        )

        # 3. Require 5 consecutive 10ms blocks (> 50ms) above dither to confirm audio
        consecutive_needed = max(1, min_continuous_ms // 10)
        is_active = (block_peaks > dither_threshold).astype(np.int32)

        # Fast sliding sum to find where sustained audio begins
        sustained = np.convolve(
            is_active, np.ones(consecutive_needed, dtype=np.int32), mode="valid"
        )
        active_indices = np.flatnonzero(sustained == consecutive_needed)

        if active_indices.size == 0:
            # File never sustained sound above dither; return original
            return waveform, 0, total_samples

        first_active_block = active_indices[0]
        last_active_block = active_indices[-1] + consecutive_needed - 1

        # 4. Convert blocks back to sample boundaries with safety padding
        lead_buffer_samples = int(lead_buffer_sec * self.sample_rate)
        trail_buffer_samples = int(
            1.5 * self.sample_rate
        )  # 1.5s for decaying reverb tails

        start_sample = max(0, (first_active_block * block_len) - lead_buffer_samples)
        end_sample = min(
            total_samples, ((last_active_block + 1) * block_len) + trail_buffer_samples
        )

        if waveform.ndim > 1:
            return waveform[:, start_sample:end_sample], start_sample, end_sample
        return waveform[start_sample:end_sample], start_sample, end_sample

    def chunk(
        self,
        waveform: np.ndarray,
    ) -> ChunkedTrack:
        filepath_str = str(filepath)

        original_total_sec = waveform.shape[-1] / self.sample_rate

        trimmed_waveform, start_sample, end_sample = self.trim_container_silence(
            waveform
        )
        music_start_sec = round(start_sample / self.sample_rate, 2)
        music_end_sec = round(end_sample / self.sample_rate, 2)
        trimmed_total_sec = trimmed_waveform.shape[-1] / self.sample_rate

        if trimmed_waveform.shape[-1] < self.sample_rate:  # Safeguard (< 1s audio)
            trimmed_waveform = waveform
            music_start_sec = 0.0
            music_end_sec = round(original_total_sec, 2)
            trimmed_total_sec = original_total_sec

        if trimmed_waveform.ndim > 1:
            trimmed_waveform = trimmed_waveform.mean(axis=0)

        total_trimmed_samples = trimmed_waveform.shape[0]

        if trimmed_total_sec <= self.crop_sec:
            single_chunk = AudioChunk(
                index=0,
                start_sec=music_start_sec,
                end_sec=music_end_sec,
                duration=round(music_end_sec - music_start_sec, 2),
                waveform=trimmed_waveform.copy(),
            )
            return ChunkedTrack(
                filepath=filepath_str,
                total_duration=round(original_total_sec, 2),
                music_start=music_start_sec,
                music_end=music_end_sec,
                chunks=[single_chunk],
            )

        sections = self._detect_sections(trimmed_waveform, trimmed_total_sec)

        chunks: list[AudioChunk] = []
        for idx, (s_start, s_end) in enumerate(sections):
            sec_dur = s_end - s_start

            if sec_dur <= self.crop_sec:
                crop_start = s_start
                crop_end = s_end
            else:
                mid = (s_start + s_end) / 2.0
                crop_start = mid - (self.crop_sec / 2.0)
                crop_end = crop_start + self.crop_sec

            c_start_sample = max(0, int(crop_start * self.sample_rate))
            c_end_sample = min(total_trimmed_samples, int(crop_end * self.sample_rate))
            chunk_wave = trimmed_waveform[c_start_sample:c_end_sample].copy()

            chunks.append(
                AudioChunk(
                    index=idx,
                    start_sec=round(s_start + music_start_sec, 2),
                    end_sec=round(s_end + music_start_sec, 2),
                    duration=round(sec_dur, 2),
                    waveform=chunk_wave,
                )
            )

        return ChunkedTrack(
            filepath=filepath_str,
            total_duration=round(original_total_sec, 2),
            music_start=music_start_sec,
            music_end=music_end_sec,
            chunks=chunks,
        )

    def _detect_sections(
        self, waveform: np.ndarray, total_sec: float
    ) -> list[tuple[float, float]]:
        """Segments audio into chapters using MFCC + Chroma with similarity merging."""
        if waveform.ndim > 1:
            waveform = waveform.mean(axis=0)

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

        # Filter micro-segments (< min_seg_sec) WITHOUT ever overwriting 0.0!
        filtered_cuts = [0.0]
        for cut in raw_cuts[1:]:
            if (cut - filtered_cuts[-1]) >= self.min_seg_sec:
                filtered_cuts.append(cut)
            elif len(filtered_cuts) > 1:
                # Absorb short segment by shifting the previous internal cut forward
                filtered_cuts[-1] = cut
            # Note: When len(filtered_cuts) == 1 (only [0.0] is in the list),
            # we simply skip 'cut' so [0.0, cut] merges forward into the next section!

        # Ensure the final boundary always reaches the end of the trimmed audio
        if filtered_cuts[-1] < total_sec:
            if (total_sec - filtered_cuts[-1]) < self.min_seg_sec and len(
                filtered_cuts
            ) > 1:
                filtered_cuts[-1] = total_sec
            else:
                filtered_cuts.append(total_sec)

        cand_sections = [
            (filtered_cuts[i], filtered_cuts[i + 1])
            for i in range(len(filtered_cuts) - 1)
        ]

        if len(cand_sections) <= 1:
            return [(0.0, total_sec)]

        # Merge acoustically redundant neighbors (> similarity_merge_threshold)
        fps = self.sample_rate / self.hop_length
        n_frames = features.shape[1]
        section_vectors = []
        for start, end in cand_sections:
            f_start = min(n_frames - 1, int(start * fps))
            f_end = min(n_frames, max(f_start + 1, int(end * fps)))
            sec_mean = np.mean(features[:, f_start:f_end], axis=1)
            section_vectors.append(sec_mean / (np.linalg.norm(sec_mean) + 1e-8))

        merged_sections = [cand_sections[0]]
        current_vec = section_vectors[0]

        for i in range(1, len(cand_sections)):
            sim = float(np.dot(current_vec, section_vectors[i]))
            if sim >= self.similarity_merge_threshold:
                prev_start, prev_end = merged_sections[-1]
                dur_prev = prev_end - prev_start
                dur_curr = cand_sections[i][1] - cand_sections[i][0]
                merged_sections[-1] = (prev_start, cand_sections[i][1])
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
