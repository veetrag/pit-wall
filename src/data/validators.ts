import { z } from 'zod'
import tuningJson from './tuning.json'
import compoundsJson from './compounds.json'
import circuitsJson from './circuits.json'
import carsJson from './cars.json'
import driversJson from './drivers.json'
import strategiesJson from './strategies.json'
import rivalriesJson from './rivalries.json'
import upgradesJson from './upgrades.json'
import scenariosJson from './scenarios.json'

const DifficultyProfileSchema = z.object({
  brainCap: z.enum(['naive', 'smart', 'optimal']),
  brainPromote: z.boolean(),
  coverReactionScale: z.number(),
  aiPaceModeAggression: z.number(),
  pitCrewConsistency: z.number(),
})

const TuningSchema = z.object({
  carPerformance: z.object({ deltaPerRating: z.number(), sectorSplit: z.tuple([z.number(), z.number(), z.number()]) }),
  driverPerformance: z.object({ deltaPerSkill: z.number(), sectorSplit: z.tuple([z.number(), z.number(), z.number()]) }),
  fuel: z.object({ effectPerLap: z.number() }),
  noise: z.object({ sigmaPerSector: z.number(), consistencyReliefFactor: z.number() }),
  trackEvolution: z.object({ startDelta: z.number(), decayLaps: z.number() }),
  traffic: z.object({
    gapThreshold: z.number(), penalty: z.number(), trafficCap: z.number(),
    // Scales the absolute per-sector penalty by hardCircuitScale / overtakingFactor,
    // so a hard circuit holds a follower up harder and not merely for longer.
    // .positive() for the same reason factorFloor has it, and more urgently:
    // zero silently switches the traffic penalty (and with it dirty air) off
    // entirely, and a negative value turns the penalty into a BONUS for
    // following. Both fail silently and plausibly, which is worse than the
    // divide-by-zero factorFloor's guard prevents.
    hardCircuitScale: z.number().positive(),
    dirtyAirDegBonus: z.number(), dirtyAirDegCapLaps: z.number(),
  }),
  overtaking: z.object({
    base: z.number(), paceGateMin: z.number(), paceMultiplier: z.number(),
    attackRacecraftBase: z.number(),
    defenceRacecraftFactor: z.number(),
    tyreFreshnessBonusMax: z.number(),
    paceModeFactor: z.number(),
    // .nonnegative(), not .positive(): 0 is a legitimate value (the
    // decomposition in MODEL_SPEC §9.4 prices the mechanism at 0), but a
    // NEGATIVE fightCost silently rewards being overtaken -- the overtaken car
    // would be handed time on a completed pass -- and would pass every gate on
    // this branch, since none of them price the defender's loss directly.
    fightCost: z.number().nonnegative(),
    // factorFloor is a BALANCE constant with a guard's name; both bounds matter.
    //
    // .positive(): it is the divisor's lower bound, so a zero divides by zero
    // and produces an unbounded penalty and cap.
    //
    // .max(0.35): above the SMALLEST per-circuit MAXIMUM overtakingFactor on
    // the calendar, the floor clips every sector of some circuit and the
    // per-circuit mechanism is silently switched off there. That smallest
    // maximum is harbour_lights' 0.35 (its factors are [0.35, 0.10, 0.20]),
    // computed from circuits.json, so 0.35 is the largest value at which any
    // circuit still varies sector-to-sector -- and the shipped value sits
    // exactly on it. Anything higher makes harbour_lights uniform, and the two
    // per-circuit clearing gates in tests/engine/overtakeRaceTime.test.ts would
    // go red with no obvious cause.
    //
    // At the shipped 0.35 the floor already CLIPS REAL CIRCUITS -- 2 of 3
    // sectors at harbour_lights and kaido, 1 of 3 at bengaluru and monsoon_bay.
    // See src/engine/types.ts and MODEL_SPEC.md §7 for the sweep that kept it
    // there anyway.
    factorFloor: z.number().positive().max(0.35),
  }),
  pit: z.object({
    stopMean: z.number(), stopSigma: z.number(),
    pitCrewMeanRelief: z.number(), pitCrewSigmaRelief: z.number(),
  }),
  paceModes: z.object({
    push:     z.object({ paceDelta: z.number(), degMultiplier: z.number() }),
    neutral:  z.object({ paceDelta: z.number(), degMultiplier: z.number() }),
    conserve: z.object({ paceDelta: z.number(), degMultiplier: z.number() }),
  }),
  qualifying: z.object({
    attackLevels: z.object({
      conserve: z.object({ paceDelta: z.number(), errorChance: z.number().min(0).max(1) }),
      balanced: z.object({ paceDelta: z.number(), errorChance: z.number().min(0).max(1) }),
      attack:   z.object({ paceDelta: z.number(), errorChance: z.number().min(0).max(1) }),
    }),
    scrappyLapPenalty: z.number(),
    seedOffset: z.number(),
    gridSlotGapSec: z.number(),
  }),
  career: z.object({
    tierDecayPerSeason: z.number().int().min(0),
    /**
     * An attribute never decays BELOW this tier. With a floor of 2 only the
     * top tier is lost, so erosion taxes the summit and leaves the foundation
     * alone -- a player still climbing does not lose ground they have not yet
     * finished paying for.
     */
    tierDecayFloor: z.number().int().min(0),
    /**
     * Development points awarded at season end for finishing P1/P2/P3 in the
     * championship. Everyone else gets nothing.
     *
     * Race income is flat, so before this existed a champion and a backmarker
     * earned identically -- while `rivalCatchUp.championBonus` gave the
     * champion a HARDER winter. Winning the title made the next season worse
     * at the same pay. This is the counterweight.
     */
    seasonEndBonus: z.array(z.number().int().min(0)).length(3),
    rivalCatchUp: z.object({
      base: z.number().min(0),
      championBonus: z.number().min(0),
    }),
    seedStride: z.number().int().positive(),
    /**
     * The team ladder (docs/superpowers/specs/2026-10-09-team-ladder-design.md).
     * A team's offset moves one step at season end when it finishes
     * `threshold` or more constructors' places better (or worse) than its car
     * deserved. Each step adds `step` to every facet in `facets`.
     */
    teamTiers: z.object({
      step: z.number().int().min(0),
      min: z.number().int().max(0),
      max: z.number().int().min(0),
      threshold: z.number().int().min(1),
      facets: z.array(z.string()).min(1),
    }),
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
  tyreFailure: z.object({
    cliffFractionThreshold: z.number(),
    chancePerLapOverThreshold: z.number(),
    maxChancePerLap: z.number(),
  }),
  mechanicalFailure: z.object({
    baseChancePerLap: z.number(),
  }),
  debrief: z.object({
    futures: z.number().int().min(1),
    lapOffsets: z.array(z.number().int()).min(1),
    minGain: z.number().min(0),
    minShare: z.number().min(0).max(1),
    timeoutMs: z.number().int().positive(),
  }),
  setup: z.object({
    _note: z.string().optional(),
    speedGain: z.number().min(0),
    gripGain: z.number().min(0),
    balanceCost: z.number().positive(),
    overtakeGain: z.number().min(0).max(1),
    wetGain: z.number().min(0),
    wetSeverity: z.object({ DAMP: z.number().min(0), WET: z.number().min(0) }),
    aiNoise: z.number().min(0).max(1),
    seedOffset: z.number().int(),
  }),
  difficultyProfiles: z.object({
    rookie: DifficultyProfileSchema,
    pro: DifficultyProfileSchema,
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
  ai: z.object({
    neutralisationWindowLaps: z.number().int().min(0),
    neutralisationCliffFrac: z.number().min(0),
  }),
  projection: z.object({
    horizonLaps: z.number(), useOvertakeRolls: z.boolean(),
    netEstimateHorizonLaps: z.number(),
  }),
  incidents: z.object({
    dnfPerLap: z.number(),
    driverErrorPerLap: z.number(),
    // The .min(0).max(1) bounds on the four probabilities and two fractions are
    // deliberate: they turn a fat-fingered 3.5 where 0.35 was meant into a
    // load-time failure rather than a silently 10x-too-frequent mechanic.
    terminalFraction: z.number().min(0).max(1),
    errorTimeLossMean: z.number(),
    errorTimeLossSigma: z.number(),
    consistencyReliefMax: z.number().min(0).max(1),
    safetyCar: z.object({
      crashDeployChance: z.number().min(0).max(1),
      mechanicalDeployChance: z.number().min(0).max(1),
      gapCompression: z.number().min(0).max(1),
      paceMultiplier: z.number(),
      laneTimeLossUnderSc: z.number(),
      durationLapsMin: z.number().int(),
      durationLapsMax: z.number().int(),
      maxPerRace: z.number().int(),
    }),
    // Same bounds philosophy as safetyCar above: a fat-fingered 2.5 where 0.25
    // was meant must fail at load time, not deploy a VSC on every retirement.
    vsc: z.object({
      crashDeployChance: z.number().min(0).max(1),
      mechanicalDeployChance: z.number().min(0).max(1),
      paceMultiplier: z.number().min(1),
      laneLossFactor: z.number().min(0).max(1),
      durationLapsMin: z.number().int().min(1),
      durationLapsMax: z.number().int().min(1),
      maxPerRace: z.number().int().min(0),
    }),
  }),
  weather: z.object({
    crossoverPenalty: z.record(z.string(), z.record(z.string(), z.number())),
    wetDegMultiplier: z.record(z.string(), z.record(z.string(), z.number())),
    wetSkillReliefMax: z.number(),
    wetNoiseReliefFactor: z.number(),
    wetIncident: z.object({
      spinChance: z.object({ DRY: z.number(), DAMP: z.number(), WET: z.number() }),
      spinTimeLossMean: z.number(),
      spinTimeLossSigma: z.number(),
      dryTrackSpinChance: z.number(),
    }),
    forecastConfidence: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
    timeline: z.object({
      onsetWindow: z.tuple([z.number(), z.number()]),
      minDuration: z.number(),
      maxDuration: z.number(),
      intensityBias: z.record(z.string(), z.number()),
    }),
  }),
  // Bands and their provenance live in MODEL_SPEC.md §3. Read only by tests —
  // src/engine/ never touches them (engine/types.ts keeps its own looser
  // declaration). Stays .optional() so a repo without bands still loads.
  _regressionBands: z.object({
    topTeamWinRate: z.tuple([z.number(), z.number()]),
    minDistinctWinners: z.number().int().positive(),
    meanAbsPosChange: z.tuple([z.number(), z.number()]),
    gridFinishSpearman: z.tuple([z.number(), z.number()]),
    minPaceRankCorrelation: z.number(),
    mechanicalDnfPerCarRace: z.tuple([z.number(), z.number()]),
    crashesPerCarRace: z.tuple([z.number(), z.number()]),
    safetyCarsPerRace: z.tuple([z.number(), z.number()]),
    vscPerRace: z.tuple([z.number(), z.number()]),
    aiNeutralisationStopsPerRace: z.tuple([z.number(), z.number()]),
    _note: z.string(),
  }).optional(),
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
  // Narrowed to the six keys `tuning.weather.timeline.intensityBias` actually
  // defines. As a bare string an unknown value passed validation and then fell
  // back to 0.2 in generateWeatherTimeline, making the circuit's advertised
  // rain character silently false with no error anywhere.
  weatherBias: z.enum(['stable', 'variable', 'wet', 'mixed', 'showery', 'stormy']).optional(),
  trackPath: z.string().optional(),
  characterNote: z.string().optional(),
  location: z.string().optional(),
  flag: z.string().optional(),
  funFacts: z.array(z.string()).optional(),
  // Same failure mode: TrackCanvas silently fell back to the 'day' palette.
  atmosphere: z.enum(['day', 'dusk', 'night', 'desert_night', 'storm', 'northern_dusk']).optional(),
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
  liveryAccent: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  facets: TeamFacetsSchema,
  archetype: z.string().optional(),
  developmentRate: z.number().optional(),
  nationality: z.string().optional(),
  flag: z.string().optional(),
  history: z.string().optional(),
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
  backstory: z.string().optional(),
})
const DriversSchema = z.object({ drivers: z.array(DriverSchema) })

const RivalrySchema = z.object({ a: z.string(), b: z.string(), note: z.string() })
const RivalriesSchema = z.object({ rivalries: z.array(RivalrySchema) })

const StrategyDefaultSchema = z.object({
  teamId: z.string(), startCompound: z.enum(['S', 'M', 'H', 'I', 'W']),
  plannedStops: z.array(z.object({ lap: z.number(), compound: z.enum(['S', 'M', 'H', 'I', 'W']) })),
  brain: z.enum(['naive', 'smart', 'optimal']).optional(),
})
const StrategiesSchema = z.object({ defaults: z.array(StrategyDefaultSchema) })

// The shop sells FIVE attributes. `racecraft`, `wetWeather` and
// `tyreManagement` were withdrawn after measurement (task-7-report.md §Q5):
//   - racecraft is worth EXACTLY zero. engine/race.ts `resolveOvertakes` swaps
//     two slots in a local array copy and never touches `raceTime`; every
//     downstream consumer re-sorts by `raceTime`, so an overtake is reverted
//     before anything reads it. 72 of 72 paired races were byte-identical.
//   - wetWeather only mitigates the wet-compound `spinLoss` roll, and the AI
//     pits onto the right compound promptly: 1 spin event in 72 races.
//   - tyreManagement measured +0.0178 s/lap for a full max-out — 6.7% of what
//     power delivers for the same price, i.e. a trap by the design's own §3
//     test, in the same category as the deliberately-excluded `pitCrew`.
// They are not labelled as traps, they are not sold. The enums below are the
// gate: re-adding one to upgrades.json now fails at parse time.
export const UpgradeAttributeSchema = z.object({
  id: z.enum(['power', 'aero', 'handling', 'reliability', 'pace']),
  label: z.string(),
  facet: z.enum(['power', 'aero', 'handling', 'reliability', 'pace']),
  target: z.enum(['team', 'driver']),
  pointsPerTier: z.number().int().positive(),
  unit: z.enum(['laptime', 'failureRisk']),
  // Optional per-attribute ceiling, applied BENEATH upgradeOverlay's global
  // FACET_MAX of 100. Exists because some facets are divisors or scale factors
  // in the engine, where reaching exactly 100 does not merely cap the benefit —
  // it removes a whole mechanic. reliability is the live case: race.ts computes
  // `perLap = baseChancePerLap * (1 - reliability/100)`, so reliability 100
  // makes the per-lap mechanical failure chance exactly 0 and the `perLap > 0`
  // short-circuit then skips the roll for every sector of every remaining race.
  // Measured before the cap: 3.25% mechanical DNF over 400 fixed-seed races at
  // reliability 96, 0 of 400 at 100 — 10 DP bought season-long invulnerability.
  //
  // A per-attribute ceiling is the right shape rather than lowering
  // pointsPerTier, which cannot fix it: from Apex's base of 96 any value >= 2
  // still reaches the ceiling by tier 3 (96 + 3*2 = 102 -> 100).
  facetMax: z.number().int().positive().max(100).optional(),
})

export const UpgradesSchema = z.object({
  income: z.object({ perRace: z.number().int().positive() }),
  tierCosts: z.array(z.number().int().positive()).length(3),
  rivalDevelopment: z.object({
    poolPerRace: z.number().positive(),
    // WHICH team facets a rival's development pool is spread across, and
    // therefore (via .length) how many ways it divides. Previously a bare
    // `facetSplit: 3` here with the facet names hardcoded in
    // upgradeOverlay.ts: the pool was multiplied by facetSplit on accrual but
    // divided by the hardcoded list's length on application, so raising
    // facetSplit to 4 would not have widened the spread — it would have handed
    // every rival a silent 33% pace buff. One source of truth removes that.
    //
    // `reliability` is deliberately NOT in this enum. It is not a pace facet at
    // all, and the rival path would drive it toward the global ceiling of 100 —
    // where race.ts computes `perLap = baseChancePerLap * (1 - 100/100) = 0` and
    // its `perLap > 0` short-circuit then skips the mechanical-failure roll for
    // every sector of every remaining race. Apex's base of 96 reaches exactly
    // 100 on a full season's pool. That is the same mechanical-immortality bug
    // `facetMax: 99` fixes on the player path, and a designer must not be able
    // to reproduce it for the whole AI grid by editing one array.
    facets: z.array(z.enum(['power', 'aero', 'handling', 'pitCrew'])).nonempty(),
  }),
  attributes: z.array(UpgradeAttributeSchema).length(5),
})

const ScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  blurb: z.string().min(1),
  circuitId: z.string().min(1),
  seed: z.number().int().nonnegative(),
  playerDriverId: z.string().min(1),
  // .positive(): a scenario IS a mid-race takeover. startLap 0 is a normal race
  // from the grid, which is what the season mode is for.
  startLap: z.number().int().positive(),
  goal: z.object({ position: z.number().int().positive() }),
  // The situation the engine produced when this scenario was authored. A test
  // re-derives it on every run, so a tuning or balance change that moves the
  // scenario fails loudly instead of silently rewriting the brief.
  expect: z.object({
    position: z.number().int().positive(),
    lapsRemaining: z.number().int().nonnegative(),
    compound: z.string().min(1),
    tyreAge: z.number().int().nonnegative(),
    // Whether the safety car is out at the handover. Recorded because it is
    // brief-bearing: "Safety Car Gamble" is ABOUT the safety car, and the
    // briefing showed only "P4 / 20 LAPS LEFT / M12" without it -- the one fact
    // the scenario turns on was missing from the screen that sells it. Pinning
    // it here also means a tuning change that stops the safety car being out at
    // that lap fails the suite instead of quietly gutting the premise.
    safetyCarOut: z.boolean(),
    // PAR: where this car finishes when the AI drives it to the flag. It is
    // what goal.position is calibrated against (goal = par - 1), so it is
    // recorded rather than recomputed -- a tuning change that moves par must
    // fail the suite, not silently re-grade every scenario.
    par: z.number().int().positive(),
  }),
})
const ScenariosWrapperSchema = z.object({ scenarios: z.array(ScenarioSchema).nonempty() })
export type ScenarioSpecData = z.infer<typeof ScenarioSchema>

export type Tuning = z.infer<typeof TuningSchema>
export type CompoundsWrapper = z.infer<typeof CompoundsWrapperSchema>
export type CircuitsWrapper = z.infer<typeof CircuitsWrapperSchema>
export type Cars = z.infer<typeof CarsSchema>
export type Drivers = z.infer<typeof DriversSchema>
export type Strategies = z.infer<typeof StrategiesSchema>
export type Rivalries = z.infer<typeof RivalriesSchema>
export type Rivalry = z.infer<typeof RivalrySchema>
export type UpgradeAttribute = z.infer<typeof UpgradeAttributeSchema>
export type UpgradesData = z.infer<typeof UpgradesSchema>

export interface GameData {
  tuning: Tuning
  compounds: CompoundsWrapper['compounds']
  circuits: CircuitsWrapper['circuits']
  cars: Cars
  drivers: Drivers
  strategies: Strategies
  rivalries: Rivalry[]
  upgrades: UpgradesData
  scenarios: ScenarioSpecData[]
}

export function loadGameData(): GameData {
  const tuning = TuningSchema.parse(tuningJson)
  const compoundsWrapper = CompoundsWrapperSchema.parse(compoundsJson)
  const circuitsWrapper = CircuitsWrapperSchema.parse(circuitsJson)
  const cars = CarsSchema.parse(carsJson)
  const drivers = DriversSchema.parse(driversJson)
  const strategies = StrategiesSchema.parse(strategiesJson)
  const rivalries = RivalriesSchema.parse(rivalriesJson)
  const upgrades = UpgradesSchema.parse(upgradesJson)
  const scenarios = ScenariosWrapperSchema.parse(scenariosJson)

  const teamIds = new Set(cars.teams.map(t => t.id))
  for (const d of drivers.drivers) {
    if (!teamIds.has(d.teamId)) throw new Error(`Driver ${d.id} references unknown teamId "${d.teamId}"`)
  }
  for (const s of strategies.defaults) {
    if (!teamIds.has(s.teamId)) throw new Error(`Strategy references unknown teamId "${s.teamId}"`)
  }
  const driverIds = new Set(drivers.drivers.map(d => d.id))
  for (const r of rivalries.rivalries) {
    if (!driverIds.has(r.a) || !driverIds.has(r.b)) throw new Error(`Rivalry references unknown driverId in pair (${r.a}, ${r.b})`)
  }
  for (const s of scenarios.scenarios) {
    if (!circuitsWrapper.circuits[s.circuitId]) throw new Error(`Scenario ${s.id} references unknown circuitId "${s.circuitId}"`)
    if (!driverIds.has(s.playerDriverId)) throw new Error(`Scenario ${s.id} references unknown playerDriverId "${s.playerDriverId}"`)
  }

  return {
    tuning,
    compounds: compoundsWrapper.compounds,
    circuits: circuitsWrapper.circuits,
    cars,
    drivers,
    strategies,
    rivalries: rivalries.rivalries,
    upgrades,
    scenarios: scenarios.scenarios,
  }
}
