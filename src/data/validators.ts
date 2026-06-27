import { z } from 'zod'
import tuningJson from './tuning.json'
import compoundsJson from './compounds.json'
import circuitsJson from './circuits.json'
import carsJson from './cars.json'
import driversJson from './drivers.json'
import strategiesJson from './strategies.json'

const TuningSchema = z.object({
  carPerformance: z.object({ deltaPerRating: z.number(), sectorSplit: z.tuple([z.number(), z.number(), z.number()]) }),
  driverPerformance: z.object({ deltaPerSkill: z.number(), sectorSplit: z.tuple([z.number(), z.number(), z.number()]) }),
  fuel: z.object({ effectPerLap: z.number() }),
  noise: z.object({ sigmaPerSector: z.number() }),
  trackEvolution: z.object({ startDelta: z.number(), decayLaps: z.number() }),
  traffic: z.object({ gapThreshold: z.number(), penalty: z.number() }),
  overtaking: z.object({ base: z.number(), paceMultiplier: z.number(), sectorFactor: z.tuple([z.number(), z.number(), z.number()]) }),
  pit: z.object({ laneTimeLoss: z.number(), stopMean: z.number(), stopSigma: z.number() }),
  paceModes: z.object({
    push:     z.object({ paceDelta: z.number(), degMultiplier: z.number() }),
    neutral:  z.object({ paceDelta: z.number(), degMultiplier: z.number() }),
    conserve: z.object({ paceDelta: z.number(), degMultiplier: z.number() }),
  }),
  projection: z.object({ horizonLaps: z.number(), useOvertakeRolls: z.boolean() }),
  incidents: z.object({ dnfPerLap: z.number(), driverErrorPerLap: z.number() }),
})

const CompoundEntrySchema = z.object({
  name: z.string(), offset: z.number(), lin: z.number(),
  cliff: z.number(), pen: z.number(), colorToken: z.string(),
})
const CompoundsSchema = z.object({ S: CompoundEntrySchema, M: CompoundEntrySchema, H: CompoundEntrySchema })

const CircuitSchema = z.object({
  name: z.string(), laps: z.number(),
  sectorBase: z.tuple([z.number(), z.number(), z.number()]),
  carSensitivity: z.tuple([z.number(), z.number(), z.number()]),
  driverSensitivity: z.tuple([z.number(), z.number(), z.number()]),
  overtakingFactor: z.tuple([z.number(), z.number(), z.number()]),
  pitLaneTimeLoss: z.number(),
  trackPath: z.string(),
  characterNote: z.string().optional(),
})
const CircuitsSchema = z.record(z.string(), CircuitSchema)

const TeamSchema = z.object({
  id: z.string(), name: z.string(), rating: z.number().int().min(0).max(9),
  reliability: z.number().min(0).max(1), colorPrimary: z.string(), colorSecondary: z.string(),
})
const CarsSchema = z.object({ teams: z.array(TeamSchema) })

const DriverSchema = z.object({
  id: z.string(), name: z.string(), code: z.string().length(3),
  teamId: z.string(), skill: z.number().int().min(0).max(10),
  racecraft: z.number().min(0).max(1), consistency: z.number().min(0).max(1),
})
const DriversSchema = z.object({ drivers: z.array(DriverSchema) })

const StrategyDefaultSchema = z.object({
  teamId: z.string(), startCompound: z.enum(['S', 'M', 'H']),
  plannedStops: z.array(z.object({ lap: z.number(), compound: z.enum(['S', 'M', 'H']) })),
})
const StrategiesSchema = z.object({ defaults: z.array(StrategyDefaultSchema) })

export type Tuning = z.infer<typeof TuningSchema>
export type Compounds = z.infer<typeof CompoundsSchema>
export type Circuits = z.infer<typeof CircuitsSchema>
export type Cars = z.infer<typeof CarsSchema>
export type Drivers = z.infer<typeof DriversSchema>
export type Strategies = z.infer<typeof StrategiesSchema>

export interface GameData {
  tuning: Tuning
  compounds: Compounds
  circuits: Circuits
  cars: Cars
  drivers: Drivers
  strategies: Strategies
}

export function loadGameData(): GameData {
  const tuning = TuningSchema.parse(tuningJson)
  const compounds = CompoundsSchema.parse(compoundsJson)
  const circuits = CircuitsSchema.parse(circuitsJson)
  const cars = CarsSchema.parse(carsJson)
  const drivers = DriversSchema.parse(driversJson)
  const strategies = StrategiesSchema.parse(strategiesJson)

  const teamIds = new Set(cars.teams.map(t => t.id))
  for (const d of drivers.drivers) {
    if (!teamIds.has(d.teamId)) throw new Error(`Driver ${d.id} references unknown teamId "${d.teamId}"`)
  }
  for (const s of strategies.defaults) {
    if (!teamIds.has(s.teamId)) throw new Error(`Strategy references unknown teamId "${s.teamId}"`)
  }

  return { tuning, compounds, circuits, cars, drivers, strategies }
}
