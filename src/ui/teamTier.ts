export type TeamTier = 'FRONT-RUNNER' | 'MIDFIELD' | 'BACKMARKER'
export function carRating(facets: Record<string, number>): number {
  const vals = Object.values(facets)
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
}
/** Rank on the grid's own spread: 1–3 front-runner, 4–8 midfield, the rest backmarker. Ties share the better rank. */
export function teamTierByRank(teamId: string, teams: { id: string; facets: Record<string, number> }[]): TeamTier {
  const mine = teams.find(t => t.id === teamId)
  if (!mine) return 'MIDFIELD'
  const r = carRating(mine.facets)
  const rank = 1 + teams.filter(t => carRating(t.facets) > r).length
  return rank <= 3 ? 'FRONT-RUNNER' : rank <= 8 ? 'MIDFIELD' : 'BACKMARKER'
}
