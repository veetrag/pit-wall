import type { RaceConfig, RaceState, CarState, SectorIndex, OvertakeEvent, WeatherState, Compound, IncidentEvent } from './types'
import type { Rng } from './rng'
import { createRng } from './rng'
import { pitStopTime } from './pitStop'
import { computeSectorTime } from './lapModel'
import { wingOvertakeFactor } from './setup'
import { openingTimeline } from './weather'
import { aiDecision } from './strategy'
import { UNLIMITED_TYRE_ALLOCATION, consumeTyreSet, resolveAllocatedCompound, effectiveTyreAge, tyreCliffFraction } from './tyres'
import {
  rollDriverError, rollErrorIsTerminal, rollErrorTimeLoss,
  rollSafetyCarDeployment, rollSafetyCarDuration, compressRaceTimes, effectivePitLaneLoss,
  rollVscDeployment, rollVscDuration, neutralisationKind,
} from './incidents'

// Grid-conditions tyre rule. A team that has not made a deliberate choice fits
// the compound that matches the weather at lights out. Deliberately simple: no
// difficulty gating, no forecasting of later laps — just "if it's wet, start on
// wets". Returns null in the dry so the team's planned compound stands.
//
// Without this, every AI car started on its hardcoded dry compound from
// strategies.json and spent the opening laps eating the wet-crossover penalty,
// handing a player who fitted wets a race-winning lead on lap 1.
function gridConditionsCompound(weather: WeatherState): Compound | null {
  if (weather === 'WET') return 'W'
  if (weather === 'DAMP') return 'I'
  return null
}

export function initRace(config: RaceConfig): RaceState {
  const laps = config.lapsOverride ?? config.circuit.laps
  // Weather is resolved before the grid is built, because the starting compound
  // now depends on lap-1 conditions. Safe to reorder: this is a separate RNG
  // stream, so it consumes nothing from the main race seed.
  const weatherTimeline = openingTimeline({
    laps,
    circuit: config.circuit,
    tuning: config.tuning,
    seed: config.seed,
    weatherSeed: config.weatherSeed,
    dryStart: config.dryStart,
    allDry: config.allDry,
  })
  const weatherState: WeatherState = weatherTimeline[0] ?? 'DRY'
  const gridCompound = gridConditionsCompound(weatherState)

  // Validate before use: a gridOrder that is not a permutation of the field
  // would otherwise silently leave cars at position 0 or stack two cars on the
  // same slot, and the symptom would surface laps later as a nonsense result.
  if (config.gridOrder) {
    const fieldIds = config.drivers.map(d => d.id)
    const given = config.gridOrder
    const unique = new Set(given)
    const ok = given.length === fieldIds.length
      && unique.size === given.length
      && given.every(id => fieldIds.includes(id))
    if (!ok) {
      throw new Error(
        `gridOrder must be a permutation of config.drivers (got ${given.length} entries, ` +
        `${unique.size} unique, for a field of ${fieldIds.length})`,
      )
    }
  }

  const cars: CarState[] = config.drivers.map((driver, i) => {
    const gridPosition = config.gridOrder ? config.gridOrder.indexOf(driver.id) + 1 : i + 1
    const isPlayer = driver.id === config.playerDriverId
    const playerChose = isPlayer && !!config.playerStrategyOverride
    const baseStrategy = (isPlayer && config.playerStrategyOverride)
      ? config.playerStrategyOverride
      : config.strategies.find(s => s.teamId === driver.teamId) ?? {
          teamId: driver.teamId, startCompound: 'M' as const, plannedStops: [],
        }
    // The player's own pick is never overridden -- they chose it in race setup,
    // and starting on the "wrong" tyre on purpose is a legitimate gamble.
    const startCompound: Compound = (!playerChose && gridCompound)
      ? gridCompound
      : baseStrategy.startCompound
    const strategy = startCompound === baseStrategy.startCompound
      ? baseStrategy
      : { ...baseStrategy, startCompound }
    const baseAllocation = config.tyreAllocationBase ?? UNLIMITED_TYRE_ALLOCATION
    return {
      driverId: driver.id,
      teamId: driver.teamId,
      position: gridPosition,
      // Starting further back is a TIME DEFICIT, not just a label.
      //
      // stepSector re-derives position from raceTime on every tick, and every
      // car starts at 0 -- so without this, a car starting P20 and a car
      // starting pole run byte-identical races and the grid evaporates on the
      // first sector. Verified before this line existed: pole and last both
      // finished P17 on 2530.682s, to the millisecond.
      //
      // Seeding raceTime with the slot's deficit makes the grid real. Gaps,
      // dirty air and the sector-boundary overtake checks then all follow from
      // the existing model rather than needing a second mechanism.
      //
      // Applied ONLY when gridOrder is present. With no grid the offset is
      // zero for every car, so byteIdentity, the Monte-Carlo bands and all
      // three scenarios stay byte-identical -- same contract as gridOrder
      // itself.
      raceTime: config.gridOrder
        ? (gridPosition - 1) * config.tuning.qualifying.gridSlotGapSec
        : 0,
      lap: 0,
      sector: 0 as SectorIndex,
      compound: startCompound,
      tyreAge: 0,
      paceMode: 'neutral',
      pitted: false,
      pitsDone: 0,
      strategy,
      isPlayer,
      tyreAllocation: consumeTyreSet({ ...baseAllocation }, startCompound),
      compoundsUsed: [startCompound],
      lapsInDirtyAir: 0,
      retired: false,
      retiredLap: null,
      retiredCause: null,
    }
  })

  return {
    lap: 0,
    sector: 0,
    totalLaps: laps,
    cars,
    sectorResults: [],
    overtakeEvents: [],
    safetyCar: null,
    incidents: [],
    trackEvolutionLaps: 0,
    rngState: config.seed,
    weatherTimeline,
    weatherState,
  }
}

export function stepSector(config: RaceConfig, state: RaceState, rng: Rng): RaceState {
  const sector = state.sector as SectorIndex
  const newSectorResults = [...state.sectorResults]
  const newOvertakeEvents: OvertakeEvent[] = [...state.overtakeEvents]
  const newIncidents: IncidentEvent[] = [...state.incidents]

  // 1. Compute sector time for each car. Retired cars are frozen entirely —
  // no more sector time, no more sim work happens to them.
  const updatedCars: CarState[] = state.cars.map(car => {
    if (car.retired) return car
    const result = computeSectorTime(config, car, sector, rng, state.weatherState, state.safetyCar)
    newSectorResults.push(result)
    let updated = { ...car, raceTime: car.raceTime + result.sectorTime }

    // Tyre failure risk: once cliffFraction runs meaningfully past the
    // threshold, roll a per-sector chance of a puncture/mechanical failure
    // that ends the car's race outright — the consequence that makes
    // "don't run tyres into the cliff and beyond" a real constraint, not
    // just an ever-steeper (but survivable) time-loss curve.
    const driver = config.drivers.find(d => d.id === car.driverId)!
    const spec = config.compounds[car.compound]
    if (spec) {
      const effAge = effectiveTyreAge(car, driver, state.weatherState, config.tuning)
      const cliffFrac = tyreCliffFraction(spec, effAge)
      const tf = config.tuning.tyreFailure
      const over = cliffFrac - tf.cliffFractionThreshold
      if (over > 0) {
        const chance = Math.min(tf.maxChancePerLap, tf.chancePerLapOverThreshold * over) / 3
        if (rng() < chance) {
          updated = { ...updated, retired: true, retiredLap: car.lap, retiredCause: 'tyre' }
        }
      }
    }

    // Mechanical failure risk, independent of tyres: scaled by the team's
    // reliability facet, which was inert until now despite every team
    // archetype advertising it ("bulletproof", "a nightmare to keep
    // running"). Rolled per sector, so the per-lap chance is divided by 3 —
    // same convention as the tyre-failure roll above.
    if (!updated.retired) {
      const team = config.teams.find(t => t.id === car.teamId)!
      const mf = config.tuning.mechanicalFailure
      const perLap = mf.baseChancePerLap * (1 - team.facets.reliability / 100)
      // reliability > 100 is unreachable today (cars.json tops out at 96 and
      // nothing else writes to facets.reliability), so perLap can't go
      // negative here. If it ever did, `perLap > 0` would read false and the
      // car would be invulnerable rather than safe — a clamp on `perLap`
      // couldn't fix that anyway, since clamping a negative chance to zero
      // *is* the invulnerability. The real guarantee belongs to whatever
      // writes facets.reliability: the planned upgrade overlay already
      // clamps the facet at 100 before it reaches here.
      // The `perLap > 0` short-circuit must stay first so a zero-configured
      // fixture (baseChancePerLap 0) never calls rng() at all — that's what
      // keeps it byte-identical to the pre-feature RNG stream.
      if (perLap > 0 && rng() < perLap / 3) {
        updated = { ...updated, retired: true, retiredLap: car.lap, retiredCause: 'mechanical' }
      }
    }

    // Driver error. Ordering within this tick is fixed and load-bearing
    // (spec 5.5): tyre failure, then mechanical, then driver error, then --
    // outside this map -- the safety-car deployment roll for anything that
    // retired. Applied HERE rather than inside computeSectorTime because the
    // terminal branch retires the car, and lapModel.ts returns a SectorResult
    // with no vocabulary for retirement.
    //
    // Consequence: the time loss is added to raceTime AFTER computeSectorTime
    // has returned, so it does NOT appear in SectorResult.sectorTime. A UI that
    // needs to show it reads the IncidentEvent log instead.
    if (!updated.retired) {
      if (rollDriverError(driver.facets.consistency, config.tuning, rng)) {
        if (rollErrorIsTerminal(config.tuning, rng)) {
          updated = { ...updated, retired: true, retiredLap: car.lap, retiredCause: 'crash' }
          newIncidents.push({
            lap: car.lap, sector, kind: 'crash', driverId: car.driverId, timeLoss: null,
          })
        } else {
          const loss = rollErrorTimeLoss(config.tuning, rng)
          updated = { ...updated, raceTime: updated.raceTime + loss }
          newIncidents.push({
            lap: car.lap, sector, kind: 'driver_error', driverId: car.driverId, timeLoss: loss,
          })
        }
      }
    }
    return updated
  })

  // Neutralisation deployment: a safety car or a VSC. Rolled at most ONCE per
  // tick even if two cars retire in it.
  //
  // `retiredThisTick` diffs against the PREVIOUS state's retired set rather
  // than testing `retiredLap === state.lap`, because several cars can retire on
  // the same lap across different sectors and we must not re-trigger on a
  // retirement an earlier tick already accounted for.
  //
  // Order is load-bearing (spec 2026-10-16 §1): the SC roll happens FIRST and
  // exactly as it did before the VSC existed, then the VSC roll only if the SC
  // did not come out. With both VSC chances at 0 the VSC roll draws nothing, so
  // the stream is untouched (tests/engine/byteIdentity.test.ts). An SC may
  // supersede a running VSC; nothing supersedes an SC; a VSC only opens on a
  // green track.
  let safetyCar = state.safetyCar
  const scCfg = config.tuning.incidents.safetyCar
  const vscCfg = config.tuning.incidents.vsc
  const activeKind = neutralisationKind(state.safetyCar)
  const wasRetired = new Set(state.cars.filter(c => c.retired).map(c => c.driverId))
  const retiredThisTick = updatedCars.filter(c => c.retired && !wasRetired.has(c.driverId))
  const scDeployedCount = state.incidents.filter(i => i.kind === 'safety_car_deployed').length
  const vscDeployedCount = state.incidents.filter(i => i.kind === 'vsc_deployed').length

  if (activeKind !== 'sc' && retiredThisTick.length > 0) {
    // The first retirement of the tick is the trigger. A tyre failure counts as
    // 'mechanical' for deployment purposes: a puncture strands a car the same
    // way a broken gearbox does, and only a crash blocks the track outright.
    const trigger = retiredThisTick[0]!
    const cause: 'crash' | 'mechanical' = trigger.retiredCause === 'crash' ? 'crash' : 'mechanical'
    if (scDeployedCount < scCfg.maxPerRace && rollSafetyCarDeployment(cause, config.tuning, rng)) {
      if (activeKind === 'vsc') {
        // Logged so every period in the incident log is closed: the lap chart
        // reads VSC and SC bands straight from these events.
        newIncidents.push({ lap: state.lap, sector, kind: 'vsc_ended', driverId: null, timeLoss: null })
      }
      safetyCar = { deployedLap: state.lap, lapsRemaining: rollSafetyCarDuration(config.tuning, rng), cause, kind: 'sc' }
      newIncidents.push({
        lap: state.lap, sector, kind: 'safety_car_deployed', driverId: null, timeLoss: null,
      })
    } else if (activeKind === null && vscDeployedCount < vscCfg.maxPerRace && rollVscDeployment(cause, config.tuning, rng)) {
      safetyCar = { deployedLap: state.lap, lapsRemaining: rollVscDuration(config.tuning, rng), cause, kind: 'vsc' }
      newIncidents.push({
        lap: state.lap, sector, kind: 'vsc_deployed', driverId: null, timeLoss: null,
      })
    }
  }

  // Compression happens ONCE, on the tick a SAFETY CAR deploys -- including one
  // that replaces a VSC. A VSC slows every car and never bunches the field: it
  // never compresses, so pace differences carry on, slowed. Applying
  // compression every tick while deployed would walk the whole field onto the
  // leader.
  const justDeployed = neutralisationKind(safetyCar) === 'sc' && activeKind !== 'sc'
  let carsAfterSc = updatedCars
  if (justDeployed) {
    const active = updatedCars.filter(c => !c.retired)
    const compressed = compressRaceTimes(active.map(c => c.raceTime), scCfg.gapCompression)
    const byId = new Map(active.map((c, i) => [c.driverId, compressed[i]!]))
    carsAfterSc = updatedCars.map(c => {
      const t = byId.get(c.driverId)
      return t === undefined ? c : { ...c, raceTime: t }
    })
  }

  // Retired cars stop racing entirely — excluded from traffic, overtakes,
  // dirty air, and AI decisions below; merged back in for final classification.
  const activeCars = carsAfterSc.filter(c => !c.retired)
  const retiredCars = carsAfterSc.filter(c => c.retired)

  // 2. Sort by raceTime (fastest first = leader) then apply traffic penalty
  const sorted = [...activeCars].sort((a, b) => a.raceTime - b.raceTime)
  const penalisedCars = sorted.map((car, idx) => {
    if (idx === 0) return car
    const ahead = sorted[idx - 1]!
    const gap = car.raceTime - ahead.raceTime
    if (gap <= config.tuning.traffic.gapThreshold) {
      const paceAdv = calculatePaceAdvantage(config, car, ahead)
      // Both the penalty's MAGNITUDE and its cap are circuit- and
      // sector-dependent, divided by the same overtakingFactor. Scaling the cap
      // alone (as this first shipped) does nothing: `penalty / 3` = 0.04 s/sector
      // is 5-20x smaller than `paceAdv * effectiveCap` at the 0.4 s/lap
      // advantage the spec targets, so `min` always returned it and the cap
      // never applied. Scaling the magnitude too is what lets a hard circuit
      // hold a follower up HARDER rather than merely for longer -- the first
      // time in this simulation that track position has defensive value.
      // factorFloor bounds the divisor so a tiny factor cannot make either term
      // unbounded, and the cap still keeps the loss proportional to the pace
      // advantage, so cars with nothing to gain are not taxed for following.
      //
      // factorFloor is NOT only a guard: at the shipped 0.35 it CLIPS 2 of 3
      // sectors at harbour_lights and kaido and 1 of 3 at bengaluru and
      // monsoon_bay, so in those sectors this penalty is a flat 7.14x and the
      // two hardest circuits are identical to each other. What still separates
      // them is `sectorEase` in resolveOvertakes, which reads the UNCLIPPED
      // factor. Full clipping table on TuningConstants.overtaking.factorFloor
      // in types.ts; the sweep that kept it at 0.35 is in MODEL_SPEC.md §7.
      const factor = Math.max(config.circuit.overtakingFactor[sector]!, config.tuning.overtaking.factorFloor)
      const rawPenalty = (config.tuning.traffic.penalty / 3) * (config.tuning.traffic.hardCircuitScale / factor)
      const effectiveCap = config.tuning.traffic.trafficCap / factor
      const cappedPenalty = Math.min(rawPenalty, paceAdv * effectiveCap)
      return { ...car, raceTime: car.raceTime + cappedPenalty }
    }
    return car
  })

  // 3. Sector-boundary overtake checks
  //
  // No overtaking under yellow. Correct for real racing, and it also stops the
  // sector-boundary check producing nonsense at freshly compressed gaps -- after
  // a x0.35 collapse most of the field is suddenly inside gapThreshold, which
  // would otherwise read as twenty simultaneous overtaking opportunities.
  //
  // resolveOvertakes both returns the reordered cars AND pushes into
  // newOvertakeEvents, so skipping the call is what suppresses the events; there
  // is no separate event list to leave empty.
  const afterOvertakesActive = safetyCar === null
    ? resolveOvertakes(config, penalisedCars, sector, state.lap, rng, newOvertakeEvents)
    : penalisedCars
  const afterOvertakes = [...afterOvertakesActive, ...retiredCars]

  // 4. Advance sector/lap counters, handle pit stops, increment tyre age
  const nextSector = ((sector + 1) % 3) as SectorIndex
  const lapCompleted = sector === 2

  // Tick the neutralisation down once per LAP, not per sector -- durations are
  // laps, so decrementing per sector would make a "3 lap" period last one.
  // Expiry is logged by kind so the UI, the commentary and the lap chart can
  // react to the restart.
  //
  // A VSC deployed on THIS tick is not counted down here: it starts counting at
  // the next lap boundary, so it always runs across at least one boundary.
  // Without this, a 1-lap VSC rolled on a sector-2 tick was deployed and ended
  // in the same step and never reached the UI. Scoped to the VSC only: the SC
  // countdown is unchanged, so the SC regression bands do not move.
  const vscDeployedThisTick = activeKind === null && neutralisationKind(safetyCar) === 'vsc'
  if (safetyCar !== null && lapCompleted && !vscDeployedThisTick) {
    const remaining = safetyCar.lapsRemaining - 1
    if (remaining <= 0) {
      const endedKind = neutralisationKind(safetyCar)
      safetyCar = null
      newIncidents.push({
        lap: state.lap, sector, kind: endedKind === 'vsc' ? 'vsc_ended' : 'safety_car_ended', driverId: null, timeLoss: null,
      })
    } else {
      safetyCar = { ...safetyCar, lapsRemaining: remaining }
    }
  }
  const newLap = lapCompleted ? state.lap + 1 : state.lap
  // The boundary that completes the race. No AI stop is taken on it (spec 1.6
  // §0.1): a stop after the last lap only adds time. aiDecision still runs and
  // its pace mode still applies (ruling R1) -- the golden fixture records that
  // pace mode, and no sector follows, so it cannot change a result.
  const raceEndsThisTick = lapCompleted && newLap >= state.totalLaps

  // Dirty air: a car held within gapThreshold of the car ahead across a whole
  // lap counts as a lap "stuck in traffic" — checked against the post-overtake
  // running order so a successful pass this lap resets the follower's count.
  // Retired cars aren't part of this — they're no longer racing.
  const dirtyAirSorted = [...afterOvertakesActive].sort((a, b) => a.raceTime - b.raceTime)
  const inDirtyAir = new Set<string>()
  for (let i = 1; i < dirtyAirSorted.length; i++) {
    const car = dirtyAirSorted[i]!
    const ahead = dirtyAirSorted[i - 1]!
    if (car.raceTime - ahead.raceTime <= config.tuning.traffic.gapThreshold) {
      inDirtyAir.add(car.driverId)
    }
  }

  const finalCars: CarState[] = afterOvertakes.map(car => {
    let updated = { ...car }
    if (car.retired) return updated // frozen: no more laps, pits, or AI
    if (lapCompleted) {
      updated.tyreAge += 1
      updated.lap += 1
      updated.lapsInDirtyAir = inDirtyAir.has(car.driverId) ? car.lapsInDirtyAir + 1 : 0
      if (!updated.isPlayer) {
        // Build a state view for the AI decision (current positions, new lap)
        // `safetyCar` here is the post-tick value (deployed, ticked down or
        // ended this tick), the same one pitStopTime charges below. Handing the
        // AI the pre-tick value would let it box "under yellow" on the boundary
        // the neutralisation ends and pay the green-flag price.
        const stateForAI: RaceState = { ...state, lap: updated.lap, cars: afterOvertakes, safetyCar }
        const decision = aiDecision(config, updated, stateForAI, rng)
        updated.paceMode = decision.paceMode
        if (decision.pit && !raceEndsThisTick) {
          const stopTime = pitStopTime(config, car.teamId, safetyCar, rng)
          updated = {
            ...updated,
            raceTime: updated.raceTime + stopTime,
            compound: decision.compound,
            tyreAge: 0,
            pitsDone: updated.pitsDone + 1,
            tyreAllocation: consumeTyreSet(updated.tyreAllocation, decision.compound),
            compoundsUsed: [...updated.compoundsUsed, decision.compound],
          }
        }
      } else if (config.playerStrategyOverride) {
        // The player's own plan, executed exactly as the race setup screen
        // promises. Indexed
        // by pitsDone like the AI's plannedStops, so a manual stop taken
        // earlier consumes the next planned one instead of adding a second.
        // Only when the player CHOSE a plan: without an override the car
        // carries its team's default strategy, which the engine has never
        // executed for the player -- and the regression oracles rely on that.
        const nextStop = updated.strategy.plannedStops[updated.pitsDone]
        if (nextStop && updated.lap >= nextStop.lap) {
          const compound = resolveAllocatedCompound(nextStop.compound, updated.tyreAllocation)
          if (compound) {
            const stopTime = pitStopTime(config, car.teamId, safetyCar, rng)
            updated = {
              ...updated,
              raceTime: updated.raceTime + stopTime,
              compound,
              tyreAge: 0,
              pitsDone: updated.pitsDone + 1,
              tyreAllocation: consumeTyreSet(updated.tyreAllocation, compound),
              compoundsUsed: [...updated.compoundsUsed, compound],
            }
          }
        }
      }
    }
    return updated
  })

  // Two-compound rule: apply the penalty at the exact tick the race ends, so
  // it's baked into raceTime before the final classification sort below.
  const isRaceEnd = raceEndsThisTick
  const carsBeforeSort = isRaceEnd && config.mandatoryTwoCompound
    ? finalCars.map(car => {
        if (car.retired) return car // DNFs are exempt — they never finished
        const usedWet = car.compoundsUsed.some(c => c === 'I' || c === 'W')
        if (usedWet) return car // wet-affected races are exempt, matches real regs
        const distinctDry = new Set(car.compoundsUsed).size
        if (distinctDry < 2) {
          return { ...car, raceTime: car.raceTime + config.tuning.tyreRules.twoCompoundPenaltySec }
        }
        return car
      })
    : finalCars

  // Re-sort and assign positions: active cars by raceTime; retired cars sort
  // after every classified runner, ranked by retiredLap descending (later
  // retirement = closer to being classified — real motorsport convention).
  const resorted = [...carsBeforeSort].sort((a, b) => {
    if (a.retired !== b.retired) return a.retired ? 1 : -1
    if (a.retired && b.retired) return (b.retiredLap ?? 0) - (a.retiredLap ?? 0)
    return a.raceTime - b.raceTime
  })
  const positioned = resorted.map((car, idx) => ({ ...car, position: idx + 1 }))

  // Advance weather on lap change
  let newWeatherState = state.weatherState
  if (lapCompleted && newLap < state.weatherTimeline.length) {
    newWeatherState = state.weatherTimeline[newLap] ?? state.weatherState
  }

  return {
    ...state,
    lap: newLap,
    sector: nextSector,
    trackEvolutionLaps: lapCompleted ? state.trackEvolutionLaps + 1 : state.trackEvolutionLaps,
    cars: positioned,
    sectorResults: newSectorResults,
    overtakeEvents: newOvertakeEvents,
    safetyCar,
    incidents: newIncidents,
    weatherState: newWeatherState,
  }
}

function resolveOvertakes(
  config: RaceConfig,
  cars: CarState[],
  sector: SectorIndex,
  lap: number,
  rng: Rng,
  events: OvertakeEvent[],
): CarState[] {
  const sorted = [...cars].sort((a, b) => a.raceTime - b.raceTime)
  const result = [...sorted]
  // Was: config.tuning.overtaking.sectorFactor[sector] -- a global constant
  // [1.0, 0.25, 0.55] sitting in the exact place the per-circuit field belongs,
  // which is why every circuit on the calendar raced identically (spec §1.2).
  // That key has since been deleted from tuning.json, validators.ts and
  // types.ts: this line was its only consumer, so it is dead data now.
  //
  // Note what the switch did and did not change. The 12-circuit MEAN of
  // circuit.overtakingFactor is 0.6055 against the old global mean of 0.6000 --
  // a 0.9% difference -- so the switch moved the SPREAD (0.217 at Harbour
  // Lights to 0.867 at Veloce) and not the average. overtaking.base therefore
  // did not need re-centring for it; see MODEL_SPEC.md §7.
  const sectorEase = config.circuit.overtakingFactor[sector]!

  // Find the single most eligible pair (smallest gap within threshold, pace advantage > 0)
  // One overtake per sector boundary — the overtaking discipline rule.
  let bestIdx = -1
  let bestProb = 0

  for (let i = 1; i < result.length; i++) {
    const behind = result[i]!
    const ahead = result[i - 1]!
    const gap = behind.raceTime - ahead.raceTime
    if (gap > config.tuning.traffic.gapThreshold) continue

    const paceAdv = calculatePaceAdvantage(config, behind, ahead)

    // Hard gate: require genuine pace advantage before any dice roll
    if (paceAdv < config.tuning.overtaking.paceGateMin) continue

    const attackerDriver = config.drivers.find(d => d.id === behind.driverId)!
    const defenderDriver = config.drivers.find(d => d.id === ahead.driverId)!
    const attackMult = config.tuning.overtaking.attackRacecraftBase + (attackerDriver.facets.racecraft / 100)
    const defendMult = 1 - (defenderDriver.facets.racecraft / 100) * config.tuning.overtaking.defenceRacecraftFactor
    const prob = Math.min(
      0.85,
      (config.tuning.overtaking.base * sectorEase +
        paceAdv * config.tuning.overtaking.paceMultiplier * sectorEase) *
        attackMult * defendMult * wingOvertakeFactor(config, behind.driverId, ahead.driverId, sector),
    )
    if (prob > bestProb) {
      bestProb = prob
      bestIdx = i
    }
  }

  if (bestIdx > 0 && rng() < bestProb) {
    const behind = result[bestIdx]!
    const ahead = result[bestIdx - 1]!
    // Swap raceTime, not just array slots. The slots alone were erased by the
    // next sort (spec §1.1): the traffic penalty, dirty air, the final
    // classification and the next tick's resolveOvertakes all re-sort by
    // raceTime. A swap conserves total time (an assignment would gift the
    // overtaker time it never made up on track) and is automatically bounded
    // to <= traffic.gapThreshold, because the pair is only eligible inside
    // that gap.
    //
    // The two slot writes below are VESTIGIAL and their order means nothing.
    // An earlier version of this comment claimed the slot assignment kept "the
    // returned array ordered for the caller"; it does not. Slot bestIdx
    // receives `behind.raceTime + fightCost`, which exceeds slot bestIdx+1's
    // time whenever the next car back is within fightCost (0.10s), so the
    // returned array can be off by one adjacent pair. It is harmless because
    // every consumer re-sorts by raceTime (dirty air and the final
    // classification in stepSector, and the next tick's resolveOvertakes), but
    // a stated invariant the code does not hold is how the original cosmetic-
    // swap bug survived review in the first place. Do not rely on the order;
    // the raceTime updates are the whole mechanism.
    //
    // fightCost is charged to the OVERTAKEN car ONLY. Charging both — as this
    // first shipped — inverts the value of racecraft: the brain that passes
    // most is billed most. Measured over 2000 races, the OPTIMAL brain's
    // finishing-position gain over NAIVE collapsed from 1.59 to 0.13 with a
    // two-sided charge (0.87 with the swap alone). The asymmetry is also the
    // physical reading: the attacker has ALREADY paid for the fight through
    // the traffic penalty it accumulated while following, so billing it again
    // double-counts, whereas the defender's lost momentum is a genuinely
    // uncompensated cost.
    const fightCost = config.tuning.overtaking.fightCost
    result[bestIdx - 1] = { ...behind, raceTime: ahead.raceTime }
    result[bestIdx] = { ...ahead, raceTime: behind.raceTime + fightCost }
    events.push({ lap, sector, overtakerId: behind.driverId, overtakenId: ahead.driverId })
  }

  return result
}

function calculatePaceAdvantage(config: RaceConfig, faster: CarState, slower: CarState): number {
  const fasterTeam = config.teams.find(t => t.id === faster.teamId)!
  const slowerTeam = config.teams.find(t => t.id === slower.teamId)!
  // Use average car performance for pace advantage estimate
  const avgFaster = (fasterTeam.facets.power + fasterTeam.facets.aero + fasterTeam.facets.handling) / 3
  const avgSlower = (slowerTeam.facets.power + slowerTeam.facets.aero + slowerTeam.facets.handling) / 3
  const fasterCarRating = (1 - avgFaster / 100) * 9
  const slowerCarRating = (1 - avgSlower / 100) * 9
  const carAdv = (slowerCarRating - fasterCarRating) * config.tuning.carPerformance.deltaPerRating
  const fasterDriver = config.drivers.find(d => d.id === faster.driverId)!
  const slowerDriver = config.drivers.find(d => d.id === slower.driverId)!
  const fasterDriverSkill = (1 - fasterDriver.facets.pace / 100) * 10
  const slowerDriverSkill = (1 - slowerDriver.facets.pace / 100) * 10
  const driverAdv = (slowerDriverSkill - fasterDriverSkill) * config.tuning.driverPerformance.deltaPerSkill

  // Tyre freshness: fresher tyres on the faster car add pace advantage (saturates at 15-lap diff)
  const tyreAgeDiff = slower.tyreAge - faster.tyreAge
  const freshnessAdv = config.tuning.overtaking.tyreFreshnessBonusMax * Math.max(0, tyreAgeDiff) / 15

  // Pace mode: an attacker on PUSH vs. a defender on NEUTRAL/CONSERVE gains a
  // real overtake-probability edge, on top of whatever raceTime gap it already
  // bought them — paceDelta is negative for PUSH (faster), so the attacker's
  // more-negative delta minus the defender's produces a positive advantage.
  const paceModeAdv =
    (config.tuning.paceModes[slower.paceMode].paceDelta - config.tuning.paceModes[faster.paceMode].paceDelta) *
    config.tuning.overtaking.paceModeFactor

  return Math.max(0, carAdv + driverAdv + freshnessAdv + paceModeAdv)
}
