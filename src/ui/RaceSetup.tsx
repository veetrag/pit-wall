import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { useUiTap } from '@hooks/useUiTap'
import { useSettingsStore } from '@state/settingsStore'
import { useSeasonStore } from '@state/seasonStore'
import type { PlayerStrategyChoice } from '@state/seasonStore'
import { CIRCUIT_ORDER } from '@state/raceStore'
import { loadGameData } from '@data/validators'
import { openingTimeline, type WeatherState } from '@engine/index'
import { expectedBestWing, type Wing } from '@engine/setup'
import { useCareerStore } from '@state/careerStore'
import { WingSelector } from '@ui/WingSelector'
import circuitsJson from '@data/circuits.json'
import { ScreenFrame, ScreenHeader, CircuitOutline, Pill, TyreChip, TYRE_NAME, Segmented, KitButton, PRESS } from '@ui/kit'
import { StintBar, stopBounds, MIN_STINT_GAP } from '@ui/StintBar'

type Compound = 'S' | 'M' | 'H' | 'I' | 'W'
type CircuitEntry = {
  name: string; laps: number; flag?: string; location?: string;
  rainProbability?: number; weatherBias?: string; characterNote?: string;
  funFacts?: string[]; pitLaneTimeLoss?: number;
}
const allCircuits = (circuitsJson as unknown as { circuits: Record<string, CircuitEntry> }).circuits
const GAME_DATA = loadGameData()

/** The wing last kept at this circuit, else the circuit's expected best. */
function defaultWing(circuitId: string): Wing {
  const remembered = useCareerStore.getState().wingByCircuit[circuitId]
  if (remembered) return remembered
  const spec = GAME_DATA.circuits[circuitId]
  return spec ? expectedBestWing(spec, GAME_DATA.tuning, spec.rainProbability ?? 0) : 3
}

const DRY_COMPOUNDS: Compound[] = ['S', 'M', 'H']
const START_COMPOUNDS: Compound[] = ['S', 'M', 'H', 'I', 'W']
const WEATHER_START: Record<WeatherState, string> = { DRY: '☀ Dry start', DAMP: '⛅ Damp start', WET: '🌧 Wet start' }
// Icon AND word, so the forecast never relies on the glyph alone.
const WEATHER_SHORT: Record<WeatherState, string> = { DRY: '☀ Dry', DAMP: '⛅ Damp', WET: '🌧 Wet' }

/** The circuit's character in a few words: characterNote up to its first period or dash. */
function characterLabel(note: string | undefined): string | null {
  const first = note?.split(/[.—–]| - /)[0]?.trim()
  return first ? first : null
}

function recommendedStartCompound(weather: WeatherState): Compound {
  if (weather === 'WET') return 'W'
  if (weather === 'DAMP') return 'I'
  return 'M'
}

/**
 * Real, seeded forecast for THIS specific attempt -- not the circuit's base
 * probability. Uses the exact same seed derivation initRace() uses
 * (seed + 999999) so what is shown here is what the race actually opens with.
 *
 * `dryStart` MUST be passed the same value the race will be built with, or
 * this screen lies. It is the THIRD place weather is derived, alongside
 * initRace() and qualifying.ts, and it is the one that goes around
 * buildRaceConfig entirely -- which is exactly how it was missed when
 * dryStart was added. The round-1 opener then showed WET and pre-selected the
 * wet tyre for a race that started DRY, which is worse than the bug dryStart
 * was fixing: a player who trusts the screen starts on wets on a dry track.
 *
 * Exported solely so tests/ui/setupWeatherAgrees.test.ts can pin this against
 * initRace across every circuit and round.
 */
export function computeStartWeather(
  circuitId: string, laps: number, seed: number, dryStart = false,
): WeatherState[] {
  const spec = GAME_DATA.circuits[circuitId]
  if (!spec) return ['DRY']
  return openingTimeline({ laps, circuit: spec, tuning: GAME_DATA.tuning, seed, dryStart })
}

const VISUALLY_HIDDEN = {
  position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap',
} as const

const SECTION_HEAD = {
  margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20,
  textTransform: 'uppercase', color: 'var(--lilac-dim)',
} as const

/**
 * A radio group of tyre chips (WAI-ARIA: one tab stop, arrows move and select).
 * `tall` is the start-tyre row (56 high, fills the width); otherwise compact 48×48.
 */
function TyreRadios({ options, value, onChange, ariaLabel, tall = false, recommended }: {
  options: Compound[]; value: Compound; onChange: (c: Compound) => void; ariaLabel: string; tall?: boolean
  /** Marked with a visible REC tag and described as recommended to assistive tech. */
  recommended?: Compound
}) {
  const uiTap = useUiTap()
  const recId = useId()
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const i = options.indexOf(value)
    const next = options[(i + step + options.length) % options.length]
    if (!next) return
    uiTap(); onChange(next)
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[options.indexOf(next)]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown} style={{ position: 'relative', display: 'flex', gap: tall ? 8 : 4 }}>
      {recommended && <span id={recId} style={VISUALLY_HIDDEN}>Recommended for the conditions</span>}
      {options.map(c => {
        const on = c === value
        const rec = c === recommended
        return (
          <motion.button key={c} type="button" role="radio" aria-checked={on} aria-label={TYRE_NAME[c]} tabIndex={on ? 0 : -1}
            aria-describedby={rec ? recId : undefined}
            className="slant-sm kit-focus" whileTap={{ scale: 0.96 }} transition={PRESS}
            onClick={() => { uiTap(); onChange(c) }}
            style={{ flex: tall ? 1 : undefined, width: tall ? undefined : 56, height: tall ? 56 : 48, border: 'none', cursor: 'pointer',
              background: on ? 'var(--dusk)' : 'var(--grape)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <TyreChip compound={c} size={tall ? (rec ? 30 : 34) : 26} />
            {rec && <span aria-hidden="true" style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 9, letterSpacing: 1,
              lineHeight: 1, color: 'var(--lilac)' }}>REC</span>}
          </motion.button>
        )
      })}
    </div>
  )
}

export function RaceSetup() {
  const confirmRaceSetup = useSeasonStore(s => s.confirmRaceSetup)
  const backToDriverSelect = useSeasonStore(s => s.backToDriverSelect)
  const uiTap = useUiTap()
  const raceIndex = useSeasonStore(s => s.raceIndex)
  const currentSeed = useSeasonStore(s => s.currentSeed)
  const defaultIdx = raceIndex % CIRCUIT_ORDER.length
  const [selectedIdx, setSelectedIdx] = useState(defaultIdx)
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  // The circuit strip is a horizontal overflow scroller: at round 12 the active
  // chip sits off-screen right, so the player sees rounds 1-3 with nothing
  // apparently selected. Pull it into view on mount and on every round change.
  const chipStripRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const chip = chipStripRef.current?.querySelector(`[data-circuit-idx="${selectedIdx}"]`)
    chip?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [selectedIdx, reducedMotion])
  const circuitId = CIRCUIT_ORDER[selectedIdx] ?? CIRCUIT_ORDER[0]!
  const circuit = allCircuits[circuitId]!
  const roundNum = raceIndex + 1
  const [factsOpen, setFactsOpen] = useState(false)

  // The ACTUAL seeded forecast for this attempt — same seed initRace() will
  // use — not just the circuit's base rain probability. This is what fixes
  // "the race starts wet and we had no idea": the player now sees it here.
  const seed = currentSeed()
  // Round 1 opens dry -- the race is built with dryStart, so the preview must
  // be too or this screen contradicts it. See computeStartWeather.
  const dryStart = raceIndex === 0
  const weatherTimeline = useMemo(
    () => computeStartWeather(circuitId, circuit.laps, seed, dryStart),
    [circuitId, circuit.laps, seed, dryStart],
  )
  const startingWeather = weatherTimeline[0] ?? 'DRY'

  const [startCompound, setStartCompound] = useState<Compound>(() => recommendedStartCompound(startingWeather))
  const [wing, setWing] = useState<Wing>(() => defaultWing(circuitId))
  // Re-seed the wing when the circuit changes (not on mount, which useState covers).
  const wingCircuitRef = useRef(circuitId)
  useEffect(() => {
    if (wingCircuitRef.current === circuitId) return
    wingCircuitRef.current = circuitId
    setWing(defaultWing(circuitId))
  }, [circuitId])
  const [stopCount, setStopCount] = useState<1 | 2>(1)
  const [pitLap1, setPitLap1] = useState(Math.round(circuit.laps * 0.45))
  const [pitCompound1, setPitCompound1] = useState<Compound>('H')
  const [pitLap2, setPitLap2] = useState(Math.round(circuit.laps * 0.7))
  const [pitCompound2, setPitCompound2] = useState<Compound>('M')

  function selectStopCount(n: 1 | 2) {
    setStopCount(n)
    if (n === 2) {
      // Switching to two stops: pull stop 1 back to leave room, then keep stop 2 in its bounds.
      const b = stopBounds(circuit.laps, 2, pitLap1)
      const clampedLap1 = Math.min(pitLap1, b.max1)
      setPitLap2(prev => Math.max(clampedLap1 + MIN_STINT_GAP, Math.min(prev, b.max2)))
      setPitLap1(clampedLap1)
    }
  }

  function moveStop(index: number, lap: number) {
    if (index === 0) {
      setPitLap1(lap)
      if (stopCount === 2) setPitLap2(prev => Math.max(prev, lap + MIN_STINT_GAP))
    } else {
      setPitLap2(lap)
    }
  }

  const stops = stopCount === 2
    ? [{ lap: pitLap1, compound: pitCompound1 }, { lap: pitLap2, compound: pitCompound2 }]
    : [{ lap: pitLap1, compound: pitCompound1 }]
  const character = characterLabel(circuit.characterNote)
  const pitLoss = circuit.pitLaneTimeLoss
  const hasFacts = !!circuit.characterNote || (circuit.funFacts?.length ?? 0) > 0

  return (
    <ScreenFrame label="Race setup">
      <ScreenHeader eyebrow="PRE-RACE SETUP" title="Race plan" onBack={backToDriverSelect} />

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Circuit chips */}
        <div ref={chipStripRef} role="group" aria-label="Circuit"
          style={{ display: 'flex', gap: 8, overflowX: 'auto', flexShrink: 0, margin: '0 -16px', padding: '0 16px 2px' }}>
          {CIRCUIT_ORDER.map((cId, i) => {
            const c = allCircuits[cId]
            if (!c) return null
            const active = i === selectedIdx
            return (
              <motion.button
                key={cId}
                type="button"
                data-circuit-idx={i}
                aria-pressed={active}
                className="kit-focus"
                whileTap={{ scale: 0.96 }} transition={PRESS}
                onClick={() => {
                  uiTap()
                  setSelectedIdx(i)
                  setPitLap1(Math.round(c.laps * (stopCount === 2 ? 0.33 : 0.45)))
                  setPitLap2(Math.round(c.laps * 0.7))
                  const newWeather = computeStartWeather(cId, c.laps, seed, dryStart)[0] ?? 'DRY'
                  setStartCompound(recommendedStartCompound(newWeather))
                }}
                style={{
                  flexShrink: 0, minHeight: 48, border: 'none', borderRadius: 999, padding: '0 16px', cursor: 'pointer',
                  background: active ? 'var(--white)' : 'var(--grape)', color: active ? 'var(--ink)' : 'var(--lilac)',
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 14,
                }}
              >
                {c.flag && <span aria-hidden="true" style={{ fontSize: 16 }}>{c.flag}</span>}
                <span>{c.name}</span>
              </motion.button>
            )
          })}
        </div>

        {/* Circuit card. flexShrink 0: it clips (overflow hidden => min-height 0),
            so in an overflowing column it would otherwise shrink to nothing. */}
        <div className="slant-lg" style={{
          flexShrink: 0, background: 'var(--night)', padding: '14px 22px', overflow: 'hidden',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 12, color: 'var(--lilac-dim)', letterSpacing: 2 }}>
              {`ROUND ${roundNum}${circuit.flag ? ` · ${circuit.flag}` : ''}`}
            </span>
            <h2 style={{
              margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 38,
              lineHeight: 0.9, textTransform: 'uppercase', color: 'var(--white)', overflowWrap: 'break-word',
            }}>
              {circuit.name}
            </h2>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, color: 'var(--lilac)' }}>
              {`${circuit.laps} laps${character ? ` · ${character}` : ''}`}
            </span>
            {circuit.location && (
              <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, color: 'var(--lilac-dim)' }}>{circuit.location}</span>
            )}
          </div>
          <div style={{ flexShrink: 0 }}>
            <CircuitOutline circuitId={circuitId} width={120} height={100} label={`${circuit.name} layout`} />
          </div>
        </div>

        {/* Actual seeded starting conditions — not just a probability */}
        <div aria-label="Conditions at lights out" role="group" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flexShrink: 0 }}>
          <Pill tone={startingWeather === 'DRY' ? 'default' : 'rain'}>{WEATHER_START[startingWeather]}</Pill>
          {weatherTimeline.slice(1, 4).map((w, i) => (
            <span key={i} data-forecast={w}><Pill tone={w === 'DRY' ? 'default' : 'rain'}>{`+${i + 1} ${WEATHER_SHORT[w]}`}</Pill></span>
          ))}
          {circuit.rainProbability !== undefined && <Pill>{`Rain ${Math.round(circuit.rainProbability * 100)}%`}</Pill>}
          {pitLoss !== undefined && <Pill>{`Pit loss ${Number.isInteger(pitLoss) ? pitLoss : pitLoss.toFixed(1)}s`}</Pill>}
        </div>
        {startingWeather !== 'DRY' && (
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, color: 'var(--hot)', lineHeight: 1.4 }}>
            ⚠ Track is <strong>{startingWeather}</strong> at lights out — starting compound below has been set to {recommendedStartCompound(startingWeather)}.
          </div>
        )}
        {hasFacts && (
          <div style={{ flexShrink: 0 }}>
            <button type="button" className="kit-focus" aria-expanded={factsOpen}
              onClick={() => { uiTap(); setFactsOpen(o => !o) }}
              style={{ minHeight: 48, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, letterSpacing: 1, color: 'var(--lilac)', textAlign: 'left' }}>
              {`MORE ABOUT ${circuit.name.toUpperCase()} ${factsOpen ? '▴' : '▾'}`}
            </button>
            {factsOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--lilac)', lineHeight: 1.4 }}>
                {circuit.characterNote && <div>{circuit.characterNote}</div>}
                {circuit.funFacts?.map((fact, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6 }}>
                    <span aria-hidden="true" style={{ color: 'var(--lilac-dim)', flexShrink: 0 }}>›</span>
                    <span>{fact}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Start tyre */}
        <h2 style={{ ...SECTION_HEAD, marginTop: 4 }}>Start tyre</h2>
        <TyreRadios options={START_COMPOUNDS} value={startCompound} onChange={setStartCompound} ariaLabel="Start tyre" tall
          recommended={recommendedStartCompound(startingWeather)} />

        {/* Wing */}
        <h2 style={{ ...SECTION_HEAD, marginTop: 4 }}>Wing</h2>
        <WingSelector circuitId={circuitId} value={wing} onChange={setWing} />

        {/* Strategy */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4, flexShrink: 0 }}>
          <h2 style={SECTION_HEAD}>Strategy</h2>
          <div style={{ width: 200 }}>
            <Segmented<'1' | '2'>
              ariaLabel="Number of stops"
              options={[{ value: '1', label: '1 STOP' }, { value: '2', label: '2 STOP' }]}
              value={stopCount === 2 ? '2' : '1'}
              onChange={v => selectStopCount(v === '2' ? 2 : 1)}
            />
          </div>
        </div>
        {stops.map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14, color: 'var(--lilac)' }}>
              {stopCount === 2 ? `Pit ${i + 1} — fit` : 'Pit — fit'}
            </span>
            <TyreRadios options={DRY_COMPOUNDS}
              value={i === 0 ? pitCompound1 : pitCompound2}
              onChange={i === 0 ? setPitCompound1 : setPitCompound2}
              ariaLabel={stopCount === 2 ? `Pit ${i + 1} tyre` : 'Pit tyre'} />
          </div>
        ))}
        <div style={{ flexShrink: 0 }}>
          <StintBar laps={circuit.laps} startCompound={startCompound} stops={stops} onChange={moveStop} />
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, color: 'var(--white)' }}>
          PLAN: {startCompound} → {pitCompound1} on lap {pitLap1}
          {stopCount === 2 && <> → {pitCompound2} on lap {pitLap2}</>}
          {' · W'}{wing}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--lilac-dim)', lineHeight: 1.4 }}>
          Drag a split to move a stop. Stops run automatically; you can pit earlier live, not later.
        </div>
      </div>

      {/* Confirm */}
      <div style={{ padding: '12px 16px', flexShrink: 0 }}>
        <KitButton
          variant="primary" size="lg" style={{ width: '100%' }}
          onClick={() => {
            const plannedStops = stopCount === 2
              ? [{ lap: pitLap1, compound: pitCompound1 }, { lap: pitLap2, compound: pitCompound2 }]
              : [{ lap: pitLap1, compound: pitCompound1 }]
            const strategy: PlayerStrategyChoice = { startCompound, plannedStops, wing }
            confirmRaceSetup(circuitId, strategy)
          }}
        >
          TO QUALIFYING →
        </KitButton>
      </div>
    </ScreenFrame>
  )
}
