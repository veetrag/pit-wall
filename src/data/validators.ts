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
  noise: z.object({ sigmaPerSector: z.number(), consistencyReliefFactor: z.number() }),
  trackEvolution: z.object({ startDelta: z.number(), decayLaps: z.number() }),
  traffic: z.object({
    gapThreshold: z.number(), penalty: z.number(), trafficCap: z.number(),
    dirtyAirDegBonus: z.number(), dirtyAirDegCapLaps: z.number(),
  }),
  overtaking: z.object({
    base: z.number(), paceGateMin: z.number(), paceMultiplier: z.number(),
    sectorFactor: z.tuple([z.number(), z.number(), z.number()]),
    attackRacecraftBase: z.number(),
    defenceRacecraftFactor: z.number(),
    tyreFreshnessBonusMax: z.number(),
    paceModeFactor: z.number(),
  }),
  pit: z.object({
    laneTimeLoss: z.number(), stopMean: z.number(), stopSigma: z.number(),
    pitCrewMeanRelief: z.number(), pitCrewSigmaRelief: z.number(),
  }),
  paceModes: z.object({
    push:     z.object({ paceDelta: z.number(), degMultiplier: z.number() }),
    neutral:  z.object({ paceDelta: z.number(), degMultiplier: z.number() }),
    conserve: z.object({ paceDelta: z.number(), degMultiplier: z.number() }),
  }),
  tyreManagement: z.object({ degReliefFactor: z.number() }),
  tyreRules: z.object({
    allocation: z.object({
      rookie: z.object({ S: z.number(), M: z.number(), H: z.number(), I: z.number(), W: z.number() }),
      pro: z.object({ S: z.number(), M: z.number(), H: z.number(), I: z.number(), W: z.number() }),
    }),
    mandatoryTwoCompound: z.object({ rookie: z.boolean(), pro: z.boolean() }),
    twoCompoundPenaltySec: z.number(),
  }),
  strategyReaction: z.object({
    coverUndercutEnabled: z.boolean(),
    coverWindowGap: z.number(),
    coverReactionProb: z.object({
      naive: z.number(), smart: z.number(), optimal: z.number(),
    }),
    minCliffFracToCover: z.number(),
    minRemainingLaps: z.number(),
  }),
  projection: z.object({
    horizonLaps: z.number(), useOvertakeRolls: z.boolean(),
    netEstimateHorizonLaps: z.number(),
  }),
  incidents: z.object({ dnfPerLap: z.number(), driverErrorPerLap: z.number() }),
  weather: z.object({
    crossoverPenalty: z.record(z.string(), z.record(z.string(), z.number())),
    wetDegMultiplier: z.record(z.string(), z.record(z.string(), z.number())),
    wetSkillReliefMax: z.number(),
    wetNoiseReliefFactor: z.number(),
    wetIncident: z.object({
      spinChance: z.object({ DRY: z.number(), DAMP: z.number(), WET: z.number() }),
      spinTimeLossMean: z.number(),
      spinTimeLossSigma: z.number(),
    }),
    forecastConfidence: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
    timeline: z.object({
      onsetWindow: z.tuple([z.number(), z.number()]),
      minDuration: z.number(),
      maxDuration: z.number(),
      intensityBias: z.record(z.string(), z.number()),
    }),
  }),
  _regressionBands: z.record(z.string(), z.unknown()).optional(),
}).passthrough()

const CompoundEntrySchema = z.object({
  name: z.string(),
  type: z.enum(['dry', 'wet']),
  offset: z.number(), lin: z.number(),
  cliff: z.number(), pen: z.number(),
  colorToken: z.string(),
  optimalState: z.enum(['DRY', 'DAMP', 'WET']).optional(),
})
const CompoundsWrapperSchema = z.object({ compounds: z.record(z.string(), CompoundEntrySchema) })

const CircuitSchema = z.object({
  name: z.string(), laps: z.number(),
  sectorBase: z.tuple([z.number(), z.number(), z.number()]),
  carSensitivity: z.tuple([z.number(), z.number(), z.number()]),
  driverSensitivity: z.tuple([z.number(), z.number(), z.number()]),
  overtakingFactor: z.tuple([z.number(), z.number(), z.number()]),
  pitLaneTimeLoss: z.number(),
  rainProbability: z.number().optional(),
  weatherBias: z.string().optional(),
  trackPath: z.string().optional(),
  characterNote: z.string().optional(),
  location: z.string().optional(),
  flag: z.string().optional(),
  funFacts: z.array(z.string()).optional(),
  atmosphere: z.string().optional(),
})
const CircuitsWrapperSchema = z.object({ circuits: z.record(z.string(), CircuitSchema) })

const TeamFacetsSchema = z.object({
  power:       z.number().min(0).max(100),
  aero:        z.number().min(0).max(100),
  handling:    z.number().min(0).max(100),
  reliability: z.number().min(0).max(100),
  pitCrew:     z.number().min(0).max(100),
})
const TeamSchema = z.object({
  id: z.string(), name: z.string(),
  colorPrimary: z.string(), colorSecondary: z.string(),
  facets: TeamFacetsSchema,
  archetype: z.string().optional(),
  developmentRate: z.number().optional(),
  nationality: z.string().optional(),
  flag: z.string().optional(),
})
const CarsSchema = z.object({ teams: z.array(TeamSchema) })

const DriverFacetsSchema = z.object({
  pace:           z.number().min(0).max(100),
  racecraft:      z.number().min(0).max(100),
  tyreManagement: z.number().min(0).max(100),
  consistency:    z.number().min(0).max(100),
  wetWeather:     z.number().min(0).max(100),
  experience:     z.number().min(0).max(100),
})
const DriverSchema = z.object({
  id: z.string(), name: z.string(), code: z.string().length(3),
  teamId: z.string(),
  facets: DriverFacetsSchema,
  archetype: z.string().optional(),
  potential: z.number().optional(),
  age: z.number().optional(),
  nationality: z.string().optional(),
  flag: z.string().optional(),
  bio: z.string().optional(),
})
const DriversSchema = z.object({ drivers: z.array(DriverSchema) })

const StrategyDefaultSchema = z.object({
  teamId: z.string(), startCompound: z.enum(['S', 'M', 'H', 'I', 'W']),
  plannedStops: z.array(z.object({ lap: z.number(), compound: z.enum(['S', 'M', 'H', 'I', 'W']) })),
  brain: z.enum(['naive', 'smart', 'optimal']).optional(),
})
const StrategiesSchema = z.object({ defaults: z.array(StrategyDefaultSchema) })

export type Tuning = z.infer<typeof TuningSchema>
export type CompoundsWrapper = z.infer<typeof CompoundsWrapperSchema>
export type CircuitsWrapper = z.infer<typeof CircuitsWrapperSchema>
export type Cars = z.infer<typeof CarsSchema>
export type Drivers = z.infer<typeof DriversSchema>
export type Strategies = z.infer<typeof StrategiesSchema>

export interface GameData {
  tuning: Tuning
  compounds: CompoundsWrapper['compounds']
  circuits: CircuitsWrapper['circuits']
  cars: Cars
  drivers: Drivers
  strategies: Strategies
}

export function loadGameData(): GameData {
  const tuning = TuningSchema.parse(tuningJson)
  const compoundsWrapper = CompoundsWrapperSchema.parse(compoundsJson)
  const circuitsWrapper = CircuitsWrapperSchema.parse(circuitsJson)
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

  return {
    tuning,
    compounds: compoundsWrapper.compounds,
    circuits: circuitsWrapper.circuits,
    cars,
    drivers,
    strategies,
  }
}
