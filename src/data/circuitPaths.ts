import pathBengaluru from '@data/paths/bengaluru.json'
import pathMonsoonBay from '@data/paths/monsoon_bay.json'
import pathVeloce from '@data/paths/veloce.json'
import pathHarbourLights from '@data/paths/harbour_lights.json'
import pathSolDesert from '@data/paths/sol_desert.json'
import pathHighland from '@data/paths/highland.json'
import pathGrandSavane from '@data/paths/grand_savane.json'
import pathAurora from '@data/paths/aurora.json'
import pathSilverpark from '@data/paths/silverpark.json'
import pathCostaVerde from '@data/paths/costa_verde.json'
import pathKaido from '@data/paths/kaido.json'
import pathAltiplano from '@data/paths/altiplano.json'
import pathLanternQuay from '@data/paths/lantern_quay.json'

export type CircuitPath = { points: number[][]; sectorBoundaries: number[]; pitEntry: number[]; pitExit: number[] }

export const CIRCUIT_PATHS: Record<string, CircuitPath> = {
  bengaluru:      pathBengaluru,
  monsoon_bay:    pathMonsoonBay,
  veloce:         pathVeloce,
  harbour_lights: pathHarbourLights,
  sol_desert:     pathSolDesert,
  highland:       pathHighland,
  grand_savane:   pathGrandSavane,
  aurora:         pathAurora,
  silverpark:     pathSilverpark,
  costa_verde:    pathCostaVerde,
  kaido:          pathKaido,
  altiplano:      pathAltiplano,
  lantern_quay:   pathLanternQuay,
}

/**
 * Circuits authored through docs/CIRCUIT-AUTHORING.md. The stricter geometry
 * and sensitivity rules in tests/data/circuitGeometry.test.ts bind these only;
 * the twelve legacy circuits predate them.
 */
export const V2_CIRCUITS: readonly string[] = ['lantern_quay']

/** Each sector's share of the loop's polyline length (boundaries are point indices). */
export function sectorArcShares(path: CircuitPath): [number, number, number] {
  const pts = path.points
  const seg: number[] = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!
    seg.push(Math.hypot((b[0] ?? 0) - (a[0] ?? 0), (b[1] ?? 0) - (a[1] ?? 0)))
  }
  const [b1, b2] = [path.sectorBoundaries[0] ?? 0, path.sectorBoundaries[1] ?? 0]
  const sum = (from: number, to: number) => seg.slice(from, to).reduce((x, y) => x + y, 0)
  const total = sum(0, seg.length)
  return [sum(0, b1) / total, sum(b1, b2) / total, sum(b2, seg.length) / total]
}
