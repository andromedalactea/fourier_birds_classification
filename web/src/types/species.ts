export interface SpeciesItem {
  species: string
  display_name: string
}

export interface SpeciesResponse {
  species: SpeciesItem[]
  count: number
}
