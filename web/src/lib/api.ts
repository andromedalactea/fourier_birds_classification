import type { PredictionResponse } from '../types/prediction'
import type { SpeciesResponse } from '../types/species'

const API_BASE = '/api'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function predictBird(
  audioFile: File,
  topK = 5,
): Promise<PredictionResponse> {
  const formData = new FormData()
  formData.append('audio', audioFile, audioFile.name)

  const response = await fetch(`${API_BASE}/predict?top_k=${topK}`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    let message = 'No se pudo analizar el audio.'
    try {
      const data = (await response.json()) as { detail?: string }
      if (data.detail) message = data.detail
    } catch {
      // keep default message
    }
    throw new ApiError(message, response.status)
  }

  return response.json() as Promise<PredictionResponse>
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`)
    return response.ok
  } catch {
    return false
  }
}

export async function fetchSpecies(): Promise<SpeciesResponse> {
  const response = await fetch(`${API_BASE}/species`)

  if (!response.ok) {
    let message = 'No se pudo cargar el catálogo de especies.'
    try {
      const data = (await response.json()) as { detail?: string }
      if (data.detail) message = data.detail
    } catch {
      // keep default message
    }
    throw new ApiError(message, response.status)
  }

  return response.json() as Promise<SpeciesResponse>
}
