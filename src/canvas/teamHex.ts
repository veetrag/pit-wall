import cars from '@data/cars.json'

// Single source of truth: team dot colours come straight from cars.json.
export const TEAM_HEX: Record<string, string> = Object.fromEntries(
  (cars as { teams: { id: string; colorPrimary: string }[] }).teams.map(t => [t.id, t.colorPrimary]),
)
