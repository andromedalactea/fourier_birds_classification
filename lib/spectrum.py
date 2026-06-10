"""Fourier spectrum profiles for visual comparison between audios and species.

A "spectrum profile" is a compact, normalized representation of the average
magnitude spectrum of an audio clip, plus its dominant frequency peaks. It is
designed for visualization (charting), not for classification.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.signal import find_peaks, stft

# Frequency resolution used for visualization spectra. A larger FFT than the
# classifier's (1024) gives smoother curves and sharper peak localization.
SPECTRUM_N_FFT = 2048
SPECTRUM_HOP = 512
SPECTRUM_N_BINS = 128
SPECTRUM_MAX_PEAKS = 5
# Frequencies below this are mic rumble / wind noise, not bird calls. They are
# attenuated before normalization so they don't dominate the visual profile.
SPECTRUM_HIGHPASS_HZ = 150.0


@dataclass
class SpectrumProfile:
    """Normalized average spectrum (0-1) with dominant frequency peaks."""

    spectrum: list[float]
    peaks: list[dict[str, float]] = field(default_factory=list)
    freq_max_hz: float = 0.0
    n_bins: int = SPECTRUM_N_BINS

    def to_dict(self) -> dict:
        return {
            "spectrum": self.spectrum,
            "peaks": self.peaks,
            "freq_max_hz": self.freq_max_hz,
            "n_bins": self.n_bins,
        }


def _pool_bins(values: np.ndarray, n_bins: int) -> np.ndarray:
    """Mean-pool a 1D array into ``n_bins`` equally sized chunks."""
    chunks = np.array_split(values, n_bins)
    return np.array([chunk.mean() for chunk in chunks], dtype=np.float64)


def _normalize(values: np.ndarray) -> np.ndarray:
    lo = float(values.min())
    hi = float(values.max())
    if hi - lo <= 1e-12:
        return np.zeros_like(values)
    return (values - lo) / (hi - lo)


def find_spectrum_peaks(
    spectrum: np.ndarray,
    freq_max_hz: float,
    max_peaks: int = SPECTRUM_MAX_PEAKS,
) -> list[dict[str, float]]:
    """Locate the dominant local maxima of a normalized spectrum."""
    n_bins = spectrum.shape[0]
    bin_width = freq_max_hz / n_bins

    indices, properties = find_peaks(
        spectrum,
        prominence=0.05,
        distance=max(2, n_bins // 32),
    )
    if indices.size == 0:
        # Degenerate spectrum: fall back to the global maximum.
        idx = int(np.argmax(spectrum))
        return [
            {
                "freq_hz": round((idx + 0.5) * bin_width, 1),
                "magnitude": round(float(spectrum[idx]), 4),
            }
        ]

    order = np.argsort(properties["prominences"])[::-1][:max_peaks]
    selected = sorted(int(indices[i]) for i in order)
    return [
        {
            "freq_hz": round((idx + 0.5) * bin_width, 1),
            "magnitude": round(float(spectrum[idx]), 4),
        }
        for idx in selected
    ]


def waveform_to_spectrum(
    waveform: np.ndarray,
    sample_rate: int,
    n_bins: int = SPECTRUM_N_BINS,
) -> SpectrumProfile:
    """Compute the normalized average log-magnitude spectrum of a waveform."""
    _, _, zxx = stft(
        waveform,
        fs=sample_rate,
        nperseg=SPECTRUM_N_FFT,
        noverlap=SPECTRUM_N_FFT - SPECTRUM_HOP,
        boundary=None,
        padded=False,
    )
    if zxx.size == 0:
        raise ValueError("Could not compute STFT for this audio.")

    magnitude = np.abs(zxx)
    # Energy-weighted average over time so silent frames don't dilute the call.
    frame_energy = magnitude.sum(axis=0)
    weights = frame_energy / (frame_energy.sum() + 1e-12)
    mean_magnitude = (magnitude * weights[None, :]).sum(axis=1)

    log_spectrum = np.log1p(mean_magnitude)

    # High-pass: suppress sub-bird-call rumble before normalization.
    freqs = np.linspace(0.0, sample_rate / 2.0, log_spectrum.shape[0])
    log_spectrum = np.where(freqs < SPECTRUM_HIGHPASS_HZ, 0.0, log_spectrum)

    pooled = _pool_bins(log_spectrum, n_bins)
    normalized = _normalize(pooled)

    freq_max_hz = sample_rate / 2.0
    return SpectrumProfile(
        spectrum=[round(float(v), 4) for v in normalized],
        peaks=find_spectrum_peaks(normalized, freq_max_hz),
        freq_max_hz=freq_max_hz,
        n_bins=n_bins,
    )


def audio_to_spectrum(
    audio_path: str,
    sample_rate: int,
    clip_seconds: float,
    n_bins: int = SPECTRUM_N_BINS,
) -> SpectrumProfile:
    """Load an audio file (same preprocessing as the classifier) and compute its profile."""
    import librosa

    waveform, _ = librosa.load(
        audio_path, sr=sample_rate, mono=True, duration=clip_seconds
    )
    if waveform.size == 0:
        raise ValueError("Decoded waveform is empty.")

    peak = np.max(np.abs(waveform))
    if peak > 0:
        waveform = waveform / peak
    return waveform_to_spectrum(waveform, sample_rate=sample_rate, n_bins=n_bins)


def average_spectra(
    profiles: list[SpectrumProfile],
    freq_max_hz: float,
) -> SpectrumProfile:
    """Average several normalized spectra into a representative species profile."""
    if not profiles:
        raise ValueError("Cannot average an empty list of spectra.")

    stacked = np.array([p.spectrum for p in profiles], dtype=np.float64)
    mean_spectrum = _normalize(stacked.mean(axis=0))

    return SpectrumProfile(
        spectrum=[round(float(v), 4) for v in mean_spectrum],
        peaks=find_spectrum_peaks(mean_spectrum, freq_max_hz),
        freq_max_hz=freq_max_hz,
        n_bins=int(stacked.shape[1]),
    )
