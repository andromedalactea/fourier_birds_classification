"""Audio feature extraction for bird species classification."""

from __future__ import annotations

import numpy as np
from scipy.signal import stft

try:
    import librosa
except ImportError as exc:
    raise ImportError(
        "Missing dependency 'librosa'. Install required packages with:\n"
        "  pip install librosa scipy scikit-learn joblib"
    ) from exc


def summarize_bands(array_2d: np.ndarray, n_bands: int = 32) -> np.ndarray:
    splits = np.array_split(array_2d, n_bands, axis=0)
    return np.array([chunk.mean() for chunk in splits], dtype=np.float32)


def summarize_series(values: np.ndarray) -> np.ndarray:
    return np.array(
        [
            float(np.mean(values)),
            float(np.std(values)),
            float(np.min(values)),
            float(np.max(values)),
        ],
        dtype=np.float32,
    )


def extract_fourier_features(
    waveform: np.ndarray,
    sample_rate: int,
    n_fft: int = 1024,
    hop_length: int = 512,
    n_bands: int = 32,
) -> np.ndarray:
    _, _, zxx = stft(
        waveform,
        fs=sample_rate,
        nperseg=n_fft,
        noverlap=n_fft - hop_length,
        boundary=None,
        padded=False,
    )
    if zxx.size == 0:
        raise ValueError("Could not compute STFT for this audio.")

    magnitude = np.abs(zxx) + 1e-10
    log_magnitude = np.log1p(magnitude)

    band_mean = summarize_bands(log_magnitude, n_bands=n_bands)
    band_var = summarize_bands(
        (log_magnitude - log_magnitude.mean(axis=1, keepdims=True)) ** 2,
        n_bands=n_bands,
    )

    freqs = np.linspace(0.0, sample_rate / 2.0, magnitude.shape[0], dtype=np.float32)
    frame_energy = magnitude.sum(axis=0) + 1e-10
    centroid = (freqs[:, None] * magnitude).sum(axis=0) / frame_energy

    cumsum_mag = np.cumsum(magnitude, axis=0)
    roll_threshold = 0.85 * frame_energy
    roll_indices = np.argmax(cumsum_mag >= roll_threshold[None, :], axis=0)
    rolloff = freqs[roll_indices]

    flatness = np.exp(np.mean(np.log(magnitude), axis=0)) / np.mean(magnitude, axis=0)

    extra_stats = np.concatenate(
        [
            summarize_series(centroid),
            summarize_series(rolloff),
            summarize_series(flatness),
            summarize_series(frame_energy),
        ],
        dtype=np.float32,
    )

    return np.concatenate([band_mean, band_var, extra_stats], dtype=np.float32)


def extract_rich_audio_features(
    waveform: np.ndarray,
    sample_rate: int,
    n_fft: int = 1024,
    hop_length: int = 512,
    n_mfcc: int = 20,
) -> np.ndarray:
    stft_features = extract_fourier_features(
        waveform=waveform,
        sample_rate=sample_rate,
        n_fft=n_fft,
        hop_length=hop_length,
        n_bands=32,
    )

    mfcc = librosa.feature.mfcc(
        y=waveform,
        sr=sample_rate,
        n_mfcc=n_mfcc,
        n_fft=n_fft,
        hop_length=hop_length,
    )
    delta = librosa.feature.delta(mfcc)
    delta2 = librosa.feature.delta(mfcc, order=2)

    def feature_stats(matrix: np.ndarray) -> np.ndarray:
        return np.concatenate(
            [
                np.mean(matrix, axis=1),
                np.std(matrix, axis=1),
            ],
            dtype=np.float32,
        )

    centroid = librosa.feature.spectral_centroid(
        y=waveform, sr=sample_rate, n_fft=n_fft, hop_length=hop_length
    )
    bandwidth = librosa.feature.spectral_bandwidth(
        y=waveform, sr=sample_rate, n_fft=n_fft, hop_length=hop_length
    )
    rolloff = librosa.feature.spectral_rolloff(
        y=waveform, sr=sample_rate, n_fft=n_fft, hop_length=hop_length
    )
    flatness = librosa.feature.spectral_flatness(
        y=waveform, n_fft=n_fft, hop_length=hop_length
    )
    zcr = librosa.feature.zero_crossing_rate(y=waveform, hop_length=hop_length)

    spectral_summary = np.array(
        [
            float(np.mean(centroid)),
            float(np.std(centroid)),
            float(np.mean(bandwidth)),
            float(np.std(bandwidth)),
            float(np.mean(rolloff)),
            float(np.std(rolloff)),
            float(np.mean(flatness)),
            float(np.std(flatness)),
            float(np.mean(zcr)),
            float(np.std(zcr)),
        ],
        dtype=np.float32,
    )

    return np.concatenate(
        [
            stft_features,
            feature_stats(mfcc),
            feature_stats(delta),
            feature_stats(delta2),
            spectral_summary,
        ],
        dtype=np.float32,
    )


def audio_to_feature(
    audio_path: str,
    sample_rate: int,
    clip_seconds: float,
) -> np.ndarray:
    waveform, _ = librosa.load(
        audio_path, sr=sample_rate, mono=True, duration=clip_seconds
    )
    if waveform.size == 0:
        raise ValueError("Decoded waveform is empty.")

    peak = np.max(np.abs(waveform))
    if peak > 0:
        waveform = waveform / peak
    return extract_rich_audio_features(waveform, sample_rate=sample_rate)
