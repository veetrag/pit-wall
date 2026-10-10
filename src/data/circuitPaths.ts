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
}
