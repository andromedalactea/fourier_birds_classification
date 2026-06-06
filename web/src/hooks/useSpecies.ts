import { useCallback, useEffect, useState } from 'react'
import { ApiError, fetchSpecies } from '../lib/api'
import type { SpeciesItem } from '../types/species'

interface UseSpeciesResult {
  species: SpeciesItem[]
  count: number
  isLoading: boolean
  error: string | null
  reload: () => void
}

export function useSpecies(enabled = true): UseSpeciesResult {
  const [species, setSpecies] = useState<SpeciesItem[]>([])
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const data = await fetchSpecies()
      setSpecies(data.species)
      setCount(data.count)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('No se pudo cargar el catálogo de especies.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (enabled) load()
  }, [enabled, load])

  return { species, count, isLoading, error, reload: load }
}
