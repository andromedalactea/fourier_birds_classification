import { useCallback, useState } from 'react'
import { ApiError, predictBird } from '../lib/api'
import type { PredictionResponse } from '../types/prediction'

interface UsePredictResult {
  result: PredictionResponse | null
  error: string | null
  isLoading: boolean
  predict: (file: File, topK?: number) => Promise<void>
  reset: () => void
}

export function usePredict(): UsePredictResult {
  const [result, setResult] = useState<PredictionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const predict = useCallback(async (file: File, topK = 5) => {
    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await predictBird(file, topK)
      setResult(response)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Ocurrió un error inesperado. Intenta de nuevo.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
    setIsLoading(false)
  }, [])

  return { result, error, isLoading, predict, reset }
}
