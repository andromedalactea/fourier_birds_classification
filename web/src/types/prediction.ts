export interface PredictionItem {
  rank: number
  species: string
  display_name: string
  probability: number
}

export interface PredictionMeta {
  feature_dim: number
  clip_seconds: number
  sample_rate: number
}

export interface SpectrumPeak {
  freq_hz: number
  magnitude: number
}

export interface SpectrumProfile {
  spectrum: number[]
  peaks: SpectrumPeak[]
  freq_max_hz: number
  n_bins: number
}

export interface SpectrumComparison {
  audio: SpectrumProfile | null
  species: Record<string, SpectrumProfile>
}

export interface PredictionResponse {
  predictions: PredictionItem[]
  meta: PredictionMeta
  spectrum?: SpectrumComparison | null
}

export type AppStatus = 'idle' | 'recording' | 'ready' | 'analyzing' | 'results' | 'error'
