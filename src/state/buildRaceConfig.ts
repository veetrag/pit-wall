import { loadGameData, type Cars } from '@data/validators'
import type { RaceConfig, StrategyBrain, DifficultyProfile } from '@engine/index'
import { aiSetups } from '@engine/setup'
import { applyUpgrades, type UpgradeOverlayInput } from './upgradeOverlay'
import { sprintLaps } from './sprint'
import type { Difficulty } from './settingsStore'
import type { PlayerStrategyChoice } from './seasonStore'

const BRAIN_ORDER: StrategyBrain[] = ['naive', 'smart', 'optimal']

// M5: brain mix is now one profile lookup instead of a difficulty if/else —
// promote one step if the profile allows it, then cap at the profile's ceiling.
function applyBrainProfile(baseBrain: StrategyBrain, profile: DifficultyProfile): StrategyBrain {
  const baseIdx = BRAIN_ORDER.indexOf(baseBrain)
  const capIdx = BRAIN_ORDER.indexOf(profile.brainCap)
  const promotedIdx = profile.brainPromote ? Math.min(baseIdx + 1, BRAIN_ORDER.length - 1) : baseIdx
  return BRAIN_ORDER[Math.min(promotedIdx, capIdx)]!
}

/**
 * The ten cars as a race would receive them: authored facets, the ladder
 * offset, then the player's upgrades or a rival's development.
 *
 * Exported so the team ladder rates teams with this same function that
 * builds the race cars. One builder for both means the ladder's ratings and
 * the simulated cars cannot be computed by two diverging code paths.
 */
export function effectiveTeams(
  playerDriverId: string,
  upgrades?: UpgradeOverlayInput | null,
): Cars['teams'] {
  const data = loadGameData()
  const playerTeam = data.drivers.drivers.find(d => d.id === playerDriverId)?.teamId
  // Run unconditionally, even with no overlay, so `config` never aliases the
  // objects `loadGameData()` returned. That loader does not memoise today (it
  // re-parses every schema per call), so this is currently belt-and-braces --
  // but memoising it is an obvious optimisation, and this keeps that refactor
  // from silently leaking one race's upgrades into the next.
  //
  // If playerDriverId resolves to no team, apply NO overlay rather than an
  // inverted one: with the team falling back to '', `appliesTo` is false
  // for every team, so the player's purchases would be discarded *and* the
  // player's own team would take the rival-development branch -- a bad id would
  // produce a loudly wrong grid instead of a harmless no-op.
  const overlayActive = playerTeam !== undefined
  return applyUpgrades(data.cars.teams, {
    attributes: data.upgrades.attributes,
    purchasedTiers: overlayActive ? upgrades?.purchasedTiers ?? {} : {},
    target: 'team',
    // Car upgrades belong to the chassis, so the player's teammate gets them too.
    appliesTo: t => t.id === (playerTeam ?? ''),
    rivalDevelopment: overlayActive ? upgrades?.rivalDevelopment ?? {} : {},
    // Offsets belong to the team, not to the player, so they apply even when
    // the player id resolves to no team.
    teamTiers: upgrades?.teamTiers ?? {},
  })
}

/**
 * A new player's very first career race: season 1, round 1 (spec 2026-10-17
 * §0.2, ruling R3). Pure, so every surface that shows or runs that race --
 * setup preview, qualifying banner, qualifying session, the race -- computes
 * the same answer.
 */
export function isFirstCareerRace(seasonNumber: number, raceIndex: number): boolean {
  return seasonNumber === 1 && raceIndex === 0
}

export function buildRaceConfig(
  seed: number,
  playerDriverId: string,
  circuitId = 'bengaluru',
  difficulty: Difficulty = 'rookie',
  playerStrategy?: PlayerStrategyChoice | null,
  // Injected, not read from seasonStore: a value import of seasonStore here
  // would close a real ESM cycle (seasonStore imports CIRCUIT_ORDER from this
  // module as a value). buildRaceConfig stays a pure function of its arguments.
  upgrades?: UpgradeOverlayInput | null,
  // The grid from qualifying, P1 first. Omitted for scenarios and for any
  // caller that wants the engine's drivers.json default -- see the comment on
  // RaceConfig.gridOrder for why absence must stay meaningful.
  gridOrder?: string[],
  // Round 1 of a season opens dry -- see RaceConfig.dryStart. Threaded rather
  // than derived because this module is a pure function of its arguments and
  // deliberately does not read seasonStore.
  dryStart?: boolean,
  // A sprint (spec 1.5 §3): a third of the distance, no two-compound rule, and
  // no planned AI stops -- strategies.json's stops scaled to ~13 laps would send
  // the whole field in for a 20s stop. Smart/optimal brains still box on wear.
  sprint = false,
  // The first career race is dry on every lap (spec 1.6 §0.2). Callers pass
  // isFirstCareerRace(...); absent on every other race.
  allDry = false,
): RaceConfig {
  const data = loadGameData()
  const circuit = data.circuits[circuitId] ?? data.circuits['bengaluru']!
  const laps = circuit.laps
  const profile = data.tuning.difficultyProfiles[difficulty]
  // Scale planned pit laps proportionally to this circuit (reference: 30 laps)
  const strategies = data.strategies.defaults.map(s => ({
    ...s,
    brain: applyBrainProfile((s.brain ?? 'naive') as StrategyBrain, profile),
    plannedStops: sprint ? [] : s.plannedStops.map(stop => ({
      ...stop,
      lap: Math.round((stop.lap / 30) * laps),
    })),
  }))

  // `playerTeam` is undefined when playerDriverId matches no driver. The `?? ''`
  // fallback below is pre-existing behaviour for playerStrategyOverride; the
  // overlay must NOT reuse it, see the guard at `overlayActive`.
  const playerTeam = data.drivers.drivers.find(d => d.id === playerDriverId)?.teamId
  const playerTeamId = playerTeam ?? ''
  const playerStrategyOverride = playerStrategy
    ? { teamId: playerTeamId, startCompound: playerStrategy.startCompound, plannedStops: playerStrategy.plannedStops }
    : undefined

  // Upgrades are applied here and nowhere else: the engine receives ordinary
  // facet numbers and never learns that progression exists (CLAUDE.md §3).
  const overlayActive = playerTeam !== undefined
  const purchasedTiers = overlayActive ? upgrades?.purchasedTiers ?? {} : {}
  const teams = effectiveTeams(playerDriverId, upgrades)
  const drivers = applyUpgrades(data.drivers.drivers, {
    attributes: data.upgrades.attributes,
    purchasedTiers,
    target: 'driver',
    // Driver upgrades are personal — the teammate does not get them.
    appliesTo: d => d.id === playerDriverId,
  })

  const config: RaceConfig = {
    circuit,
    tuning: data.tuning,
    compounds: data.compounds,
    drivers,
    teams,
    strategies,
    playerDriverId,
    seed,
    playerStrategyOverride,
    tyreAllocationBase: data.tuning.tyreRules.allocation[difficulty],
    mandatoryTwoCompound: sprint ? false : data.tuning.tyreRules.mandatoryTwoCompound[difficulty],
    coverReactionScale: profile.coverReactionScale,
    paceModeAggression: profile.aiPaceModeAggression,
    gridOrder,
    dryStart,
  }
  // Set only for a sprint, so a Grand Prix config has no lapsOverride key at all.
  if (sprint) config.lapsOverride = sprintLaps(circuit.laps)
  if (allDry) config.allDry = true
  // Absent wing leaves `setups` absent (not undefined) so old-path configs stay identical.
  const wing = playerStrategy?.wing
  if (wing !== undefined) config.setups = { ...aiSetups(config), [playerDriverId]: wing }
  return config
}

/**
 * Scenarios are pinned to ONE difficulty, deliberately.
 *
 * A scenario is a seed plus a lap, and that pair only reproduces the authored
 * situation if the config is identical too. Difficulty is not cosmetic here: it
 * changes strategy brains, tyre allocation, the mandatory-two-compound rule,
 * cover reaction and AI pace-mode aggression -- so reading it from settings
 * would hand two players with different settings two different races under one
 * brief. See the table in the plan doc: an unshared config turned "buried in
 * the pack, P8" into leading the race.
 */
export const SCENARIO_DIFFICULTY: Difficulty = 'rookie'

/**
 * The ONLY way to build a scenario's RaceConfig.
 *
 * Both scripts/find-scenarios.ts (authoring) and raceStore (play) call this, so
 * the situation the search prints is the situation the player is handed. Note
 * the player id passed to buildRaceConfig is the REAL one: startScenario swaps
 * in its own autopilot id for the fast-forward and hands the car back after.
 */
export function buildScenarioConfig(
  spec: { circuitId: string; seed: number; playerDriverId: string },
): RaceConfig {
  return buildRaceConfig(
    spec.seed, spec.playerDriverId, spec.circuitId, SCENARIO_DIFFICULTY,
    null,   // no pre-race strategy: the player takes over mid-race
    null,   // no season upgrades: a scenario must not vary with save state
  )
}
