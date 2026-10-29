import numpy as np
import torch


def compute_rms_envelope(
    waveform: np.ndarray | torch.Tensor,
    n_points: int = 200,
) -> list[float]:
    """
    Computes a peak-normalized N-point RMS volume envelope from an in-memory waveform.
    Accepts 1D or multi-channel NumPy arrays or PyTorch tensors.
    """
    if isinstance(waveform, torch.Tensor):
        waveform = waveform.detach().cpu().numpy()

    # Downmix multi-channel arrays (channels, samples) to mono
    if waveform.ndim > 1:
        if waveform.shape[0] < waveform.shape[1]:
            waveform = np.mean(waveform, axis=0)
        else:
            waveform = np.mean(waveform, axis=1)

    waveform = waveform.flatten()
    total_samples = len(waveform)

    if total_samples == 0:
        return [0.0] * n_points

    bin_size = total_samples / n_points
    rms_values = np.zeros(n_points, dtype=np.float32)

    for i in range(n_points):
        start = int(i * bin_size)
        end = int((i + 1) * bin_size)
        chunk = waveform[start:end]
        if len(chunk) > 0:
            rms_values[i] = np.sqrt(np.mean(chunk**2))

    # Peak normalize to [0.0, 1.0] so the envelope represents relative dynamics
    peak = float(np.max(rms_values))
    if peak > 1e-6:
        rms_values = rms_values / peak
    else:
        return [0.0] * n_points

    return [round(float(v), 4) for v in rms_values]
