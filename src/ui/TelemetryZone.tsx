import { useEffect } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useCoachStore } from '@state/coachStore'
import { useCoachingActive } from '@hooks/useCoachingActive'
import { tyreCliffFraction, effectiveTyreAge } from '@engine/index'
import { wingOf } from '@engine/setup'
import type { RaceConfig, RaceState } from '@engine/types'
import { TyreMeter } from '@ui/kit'

// Keyed rather than a ternary chain on purpose. This used to read
// `retiredCause === 'mechanical' ? 'mechanical failure' : 'tyre failure'`,
// which silently mislabelled anything that was neither -- and once the
// race-incidents work added 'crash', every crash was reported to the player as
// a tyre failure. A Record<> makes a new cause a COMPILE error here instead.
const RETIREMENT_CAUSE_TEXT: Record<'tyre' | 'mechanical' | 'crash', string> = {
  tyre: 'tyre failure',
  mechanical: 'mechanical failure',
  crash: 'crash',
}

/**
 * The player's tyre-cliff state, or null when there is no player car to read.
 *
 * Extracted so the tyre meter and the "the cliff is coming" coach mark are driven by
 * the SAME numbers. It also has to be callable before TelemetryZone's early
 * returns, because the coach-mark effect below them would otherwise be a
 * conditional hook -- `player.retired` flips mid-race while the component stays
 * mounted.
 */
function cliffStatus(raceState: RaceState | null, config: RaceConfig | null) {
  if (!raceState || !config) return null
  const player = raceState.cars.find(c => c.isPlayer)
  if (!player) return null
  const spec = config.compounds[player.compound]
  const driver = config.drivers.find(d => d.id === player.driverId)
  const effAge = driver && spec ? effectiveTyreAge(player, driver, raceState.weatherState, config.tuning) : player.tyreAge
  const wearRate = driver && spec ? effectiveTyreAge({ ...player, tyreAge: 1 }, driver, raceState.weatherState, config.tuning) : 1
  const fraction = spec ? tyreCliffFraction(spec, effAge) : 0
  const cliffIn = spec ? Math.max(0, Math.ceil((spec.cliff - effAge) / Math.max(wearRate, 0.01))) : null
  return { player, spec, effAge, wearRate, fraction, cliffIn, pastCliff: fraction >= 1.0, retired: player.retired }
}

export function TelemetryZone() {
  const raceState = useRaceStore(s => s.raceState)
  const config    = useRaceStore(s => s.config)
  const coaching = useCoachingActive()
  const request = useCoachStore(s => s.request)

  // Computed ONCE, above every early return, and used by both the coach-mark
  // effect and the tyre meter below.
  //
  // It has to be above the returns because hooks must run unconditionally and
  // `player.retired` can flip mid-race while this component stays mounted --
  // computing it next to the meter and reading it from an effect would change
  // the hook count on the lap the player retires.
  //
  // It is ONE computation rather than a second copy for the effect: two copies
  // of the cliff formula would have to be kept in agreement by hand, and a
  // coach mark that fires on a different definition of "the cliff is coming"
  // than the meter draws is a tutorial that points at the wrong thing.
  const cliff = cliffStatus(raceState, config)

  const approaching = cliff !== null && !cliff.retired && cliff.cliffIn !== null &&
    cliff.cliffIn <= 5 && !cliff.pastCliff
  useEffect(() => {
    if (coaching && approaching) request('tyre_cliff')
  }, [coaching, approaching]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!raceState || !config || cliff === null) return null

  const { player, fraction, cliffIn, pastCliff } = cliff

  if (player.retired) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '6px 10px', background: 'var(--grape)',
        borderBottom: '1px solid var(--line-hair)', height: 130, flexShrink: 0,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--hot)', letterSpacing: '0.05em' }}>
            DNF
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--lilac-dim)', marginTop: 4 }}>
            Retired on lap {player.retiredLap ?? '—'} — {RETIREMENT_CAUSE_TEXT[player.retiredCause ?? 'tyre']}
          </div>
        </div>
      </div>
    )
  }

  // Wing chip: only shown when a wing was chosen (setups present on the config).
  const wing = config.setups ? wingOf(config, player.driverId) : null

  // Plan line: the next planned stop, if any (position now lives in the tower).
  const nextStop = player.strategy.plannedStops[player.pitsDone] ?? null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8,
      padding: '10px 14px',
      background: 'var(--night)',
      flexShrink: 0, color: 'var(--white)',
    }}>
      <TyreMeter
        compound={player.compound}
        wear={Math.min(1, Math.max(0, fraction))}
        lapsOnTyre={player.tyreAge}
        cliffLaps={cliffIn}
        pastCliff={pastCliff}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{
          color: 'var(--lilac)', fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {nextStop ? `PLAN · PIT L${nextStop.lap}` : 'NO STOP PLANNED'}
        </span>
        {wing !== null && (
          <span
            aria-label={`Wing level ${wing}`}
            className="slant-sm"
            style={{
              padding: '2px 10px', background: 'var(--grape)', color: 'var(--white)',
              fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
            }}
          >
            W{wing}
          </span>
        )}
      </div>
    </div>
  )
}
