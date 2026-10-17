import { useMemo, useState } from 'react'
import { useSeasonStore } from '@state/seasonStore'
import { sprintLaps } from '@state/sprint'
import { loadGameData } from '@data/validators'
import type { Compound, PaceMode, WeatherState } from '@engine/types'
import { ScreenFrame, ScreenHeader, Pill, Segmented, KitButton } from '@ui/kit'
import { TyreRadios, computeStartWeather, prefilledStartCompound, SECTION_HEAD, WEATHER_START } from '@ui/RaceSetup'
import { paceSub, PACE_LABEL, PACE_ORDER } from '@ui/PaceModeToggle'

const GAME_DATA = loadGameData()
const START_COMPOUNDS: Compound[] = ['S', 'M', 'H', 'I', 'W']

/**
 * Sprint setup (spec 1.5 §3): start tyre and pace off the line only. No
 * planned stop -- there is no mandatory stop -- but the PIT button still works
 * in the race. The grid is the one qualifying already set for the weekend.
 */
export function SprintSetup() {
  const raceIndex = useSeasonStore(s => s.raceIndex)
  const currentCircuitId = useSeasonStore(s => s.currentCircuitId)
  const currentSprintSeed = useSeasonStore(s => s.currentSprintSeed)
  const confirmSprintSetup = useSeasonStore(s => s.confirmSprintSetup)
  const qualifyingResult = useSeasonStore(s => s.qualifyingResult)
  const playerDriverId = useSeasonStore(s => s.playerDriverId)
  // Read once: the previous attempt's choices pre-fill a RETRY SPRINT.
  const [previous] = useState(() => useSeasonStore.getState().sprintStrategy)

  const circuitId = currentCircuitId()
  const circuit = GAME_DATA.circuits[circuitId]
  const laps = sprintLaps(circuit?.laps ?? 30)
  const seed = currentSprintSeed()
  // The same derivation the sprint race uses (RaceWatcher passes dryStart =
  // raceIndex === 0), pinned by tests/ui/sprintScreens.test.tsx.
  const timeline = useMemo(() => computeStartWeather(circuitId, laps, seed, raceIndex === 0), [circuitId, laps, seed, raceIndex])
  const weather: WeatherState = timeline[0] ?? 'DRY'
  const recommended = prefilledStartCompound(null, weather)
  const [startCompound, setStartCompound] = useState<Compound>(() =>
    previous ? prefilledStartCompound({ startCompound: previous.startCompound, plannedStops: [] }, weather) : recommended)
  const [paceMode, setPaceMode] = useState<PaceMode>(previous?.paceMode ?? 'neutral')

  const gridSlot = qualifyingResult && playerDriverId ? qualifyingResult.order.indexOf(playerDriverId) + 1 : 0
  const points = GAME_DATA.tuning.sprint.points
  const scoring = points.length > 0 ? `TOP ${points.length} SCORE ${points[0]}–${points[points.length - 1]}` : null

  return (
    <ScreenFrame label="Sprint setup">
      <ScreenHeader eyebrow={`ROUND ${raceIndex + 1} · SPRINT WEEKEND`} title="Sprint" />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div role="group" aria-label="Sprint at a glance" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
          <Pill tone="dusk">{`${laps} LAPS`}</Pill>
          {gridSlot > 0 && <Pill>{`GRID P${gridSlot}`}</Pill>}
          <Pill tone={weather === 'DRY' ? 'default' : 'rain'}>{WEATHER_START[weather]}</Pill>
          {scoring && <Pill>{scoring}</Pill>}
        </div>
        <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--lilac)', lineHeight: 1.4 }}>
          No mandatory stop. You can still box from the pit wall. The Grand Prix starts from the same grid.
        </p>

        <h2 style={{ ...SECTION_HEAD, marginTop: 4 }}>Start tyre</h2>
        <TyreRadios options={START_COMPOUNDS} value={startCompound} onChange={setStartCompound}
          ariaLabel="Sprint start tyre" tall recommended={recommended} />

        <h2 style={{ ...SECTION_HEAD, marginTop: 4 }}>Pace off the line</h2>
        <Segmented<PaceMode>
          ariaLabel="Sprint pace"
          options={PACE_ORDER.map(m => ({ value: m, label: PACE_LABEL[m], sub: paceSub(GAME_DATA.tuning.paceModes[m]) }))}
          value={paceMode}
          onChange={setPaceMode}
        />
      </div>
      <div style={{ padding: '12px 16px', flexShrink: 0 }}>
        <KitButton variant="primary" size="lg" style={{ width: '100%' }}
          onClick={() => confirmSprintSetup({ startCompound, paceMode })}>
          TO THE SPRINT GRID →
        </KitButton>
      </div>
    </ScreenFrame>
  )
}
