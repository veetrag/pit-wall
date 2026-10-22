import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { defaultRestartCompound, restartConditions } from '@engine/redFlag'
import type { Compound, RaceConfig, RaceState } from '@engine/types'
import { useHaptics, ImpactStyle } from '@hooks/useHaptics'
import { useUiTap } from '@hooks/useUiTap'
import { KitButton, TyreChip, TYRE_NAME, EASE, PRESS, useReducedMotion } from '@ui/kit'

const ORDER: Compound[] = ['S', 'M', 'H', 'I', 'W']

/**
 * Spec 2026-10-17 §4: the race is stopped. A full-screen card -- ink ground,
 * hot header (preflight E16) -- shows the frozen order (top 6 + you), offers
 * the free tyre change and RESTART (volt). Below StartLights (200), above the
 * pit drawer and coach marks.
 */
function Card({ config, state }: { config: RaceConfig; state: RaceState }) {
  const confirm = useRaceStore(s => s.confirmRedFlagRestart)
  const reduced = useReducedMotion()
  const uiTap = useUiTap()
  const { impact } = useHaptics()
  useEffect(() => { impact(ImpactStyle.Heavy) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const player = state.cars.find(c => c.isPlayer)
  const running = state.cars.filter(c => !c.retired).sort((a, b) => a.position - b.position)
  const rows = running.slice(0, 6)
  if (player && !player.retired && player.position > 6) rows.push(player)
  const code = (id: string) => config.drivers.find(d => d.id === id)?.code ?? id

  // One derivation with the engine and the default (preflight S6).
  const { weather } = restartConditions(state)
  const wet = weather !== 'DRY' || state.weatherState !== 'DRY'
  const alloc = player?.tyreAllocation
  const offered = ORDER.filter(c => wet || (c !== 'I' && c !== 'W'))
  const hasSets = (c: Compound) => !alloc || alloc[c] > 0
  // Exactly what the engine would fit with no call (preflight E20).
  const [selected, setSelected] = useState<Compound>(() => defaultRestartCompound(config, state))
  const chips = useRef(new Map<Compound, HTMLButtonElement>())
  // Focus moves into the dialog, onto the selected tyre (a modal must own focus).
  useEffect(() => { chips.current.get(selected)?.focus() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Arrow-key roving across the radiogroup, skipping compounds with no sets.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (dir === 0) return
    e.preventDefault()
    const usable = offered.filter(hasSets)
    if (usable.length === 0) return
    const i = usable.indexOf(selected)
    const next = usable[(i + dir + usable.length) % usable.length]!
    setSelected(next)
    chips.current.get(next)?.focus()
  }

  return (
    // The ROOT is opaque ink over the whole viewport from its first frame and
    // never fades (1.6 device report: the HUD showed through while the root's
    // opacity animated). Only the content inside slides in. Portalled to the
    // body so no transformed or fading screen frame can contain it.
    <div
      role="dialog" aria-modal="true" aria-labelledby="red-flag-title" data-testid="red-flag-root"
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 150, background: 'var(--ink)', color: 'var(--white)',
        display: 'flex', flexDirection: 'column',
        padding: 'calc(16px + var(--safe-top)) 16px calc(16px + var(--safe-bottom))', overflowY: 'auto', boxSizing: 'border-box',
      }}
    >
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div className="slant-lg" style={{ background: 'var(--hot)', color: 'var(--ink)', padding: '14px 22px' }}>
        <h2 id="red-flag-title" style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 44, lineHeight: 1 }}>
          RED FLAG
        </h2>
        <div style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 13, letterSpacing: 1, fontVariantNumeric: 'tabular-nums' }}>
          RACE SUSPENDED · LAP {state.lap + 1}/{state.totalLaps}
        </div>
      </div>

      <ol aria-label="Order at the stoppage" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map(c => {
          const mine = c.isPlayer
          return (
            <li key={c.driverId} data-testid="red-flag-row" data-mine={mine ? 'true' : 'false'} className="slant-row"
              style={{
                display: 'flex', gap: 10, alignItems: 'center', minHeight: 40, padding: '0 16px',
                background: mine ? 'var(--volt)' : 'var(--grape)', color: mine ? 'var(--ink)' : 'var(--white)',
                fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 15, fontVariantNumeric: 'tabular-nums',
              }}>
              <span style={{ width: 36 }}>P{c.position}</span>
              <span style={{ flex: 1 }}>{code(c.driverId)}</span>
              <TyreChip compound={c.compound} size={20} onInk={!mine} />
            </li>
          )
        })}
      </ol>

      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, letterSpacing: 1 }}>FREE TYRE CHANGE</div>
      <div role="radiogroup" aria-label="Restart tyre" onKeyDown={onKeyDown} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {offered.map(c => {
          const on = selected === c
          const empty = !hasSets(c)
          const sets = alloc?.[c]
          return (
            <motion.button key={c} type="button" role="radio" aria-checked={on} aria-disabled={empty || undefined}
              aria-label={`${TYRE_NAME[c]}${sets !== undefined ? `, ${sets} set${sets === 1 ? '' : 's'}` : ''}`}
              data-compound={c} className="slant-sm kit-focus" tabIndex={on ? 0 : -1}
              ref={el => { if (el) chips.current.set(c, el); else chips.current.delete(c) }}
              whileTap={reduced || empty ? undefined : { scale: 0.96 }} transition={PRESS}
              onClick={() => { if (empty) return; uiTap(); setSelected(c) }}
              style={{
                flex: '1 1 calc(33% - 6px)', minWidth: 72, minHeight: 64, border: 'none', cursor: empty ? 'default' : 'pointer',
                opacity: empty ? 0.4 : 1, background: on ? 'var(--volt)' : 'var(--grape)', color: on ? 'var(--ink)' : 'var(--white)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 14,
              }}>
              <TyreChip compound={c} size={24} onInk={!on} />
              {TYRE_NAME[c].toUpperCase()}
            </motion.button>
          )
        })}
      </div>

      <KitButton variant="primary" size="lg" ariaLabel="Restart the race" haptic={false}
        onClick={() => { impact(ImpactStyle.Heavy); confirm(selected) }} style={{ width: '100%', marginTop: 'auto' }}>
        RESTART
      </KitButton>
    </motion.div>
    </div>
  )
}

export function RedFlagCard() {
  // Narrow (preflight S8): null outside the stoppage, so sim ticks do not re-render this.
  const config = useRaceStore(s => (s.phase === 'red_flag' ? s.config : null))
  const state = useRaceStore(s => (s.phase === 'red_flag' ? s.raceState : null))
  if (!config || !state) return null
  return createPortal(<Card config={config} state={state} />, document.body)
}
