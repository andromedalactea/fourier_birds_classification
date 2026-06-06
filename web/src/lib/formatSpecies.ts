export function formatSpecies(species: string): string {
  return species.replace(/_/g, ' ')
}

export function formatProbability(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
