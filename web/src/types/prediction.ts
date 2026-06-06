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

export interface PredictionResponse {
  predictions: PredictionItem[]
  meta: PredictionMeta
}

export type AppStatus = 'idle' | 'recording' | 'ready' | 'analyzing' | 'results' | 'error'
