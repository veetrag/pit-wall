import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Share } from '@capacitor/share'
import type { PlayerCall } from '@engine/playerCalls'
import type { Compound } from '@engine/types'
import type { RaceRecipe } from '@state/raceRecipe'
import { lapRange, makeCustomStart, situationAt, defaultStartName, type MakeStartResult } from '@state/customStart'
import { encodeStart } from '@state/startCode'
import { useStartsStore } from '@state/startsStore'
import { useUiTap } from '@hooks/useUiTap'
import { Pill, TyreChip, KitButton, EASE, useReducedMotion } from '@ui/kit'

const REFUSAL = { par_one: 'THE AI ALREADY WINS FROM HERE', par_retired: 'TOO MUCH OF A LOTTERY FROM HERE — PICK ANOTHER LAP', lap_range: 'PICK A LAP INSIDE THE RACE' } as const

export function MakeStartSheet({ recipe, calls, onClose }: { recipe: RaceRecipe; calls: PlayerCall[]; onClose: () => void }) {
  const range = useMemo(() => lapRange(recipe), [recipe])
  const [lap, setLap] = useState(Math.round((range.min + range.max) / 2))
  const [shownLap, setShownLap] = useState(lap)
  const [result, setResult] = useState<MakeStartResult | null>(null)
  const [name, setName] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const reduced = useReducedMotion()
  const uiTap = useUiTap()
  const sliderRef = useRef<HTMLInputElement>(null)

  useEffect(() => { const t = setTimeout(() => setShownLap(lap), 120); return () => clearTimeout(t) }, [lap])
  useEffect(() => { sliderRef.current?.focus() }, [])
  const sit = useMemo(() => situationAt(recipe, calls, shownLap), [recipe, calls, shownLap])

  function setStart() { uiTap(); setResult(makeCustomStart(recipe, calls, lap, name.trim() || undefined)); setSaved(null) }
  function save() {
    if (!result?.ok || saved !== null) return
    uiTap(); useStartsStore.getState().save(result.payload); setSaved('SAVED TO MY STARTS')
  }
  async function share() {
    if (!result?.ok) return
    uiTap()
    try { await Share.share({ title: 'Pit Wall start', text: `Try my Pit Wall start "${result.payload.name}": ${encodeStart(result.payload)}` }) } catch { /* cancelled */ }
  }

  return (
    <>
    <motion.div data-testid="make-start-scrim" aria-hidden="true" onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, ease: EASE }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(18, 14, 43, 0.72)', zIndex: 39 }} />
    <motion.div role="dialog" aria-modal="true" aria-label="Make a start"
      initial={reduced ? { opacity: 0 } : { y: '100%' }} animate={reduced ? { opacity: 1 } : { y: 0 }} transition={{ duration: 0.18, ease: EASE }}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      className="slant-lg" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: 'var(--grape)', padding: '20px 20px calc(20px + var(--safe-bottom))', display: 'flex', flexDirection: 'column', gap: 12, zIndex: 40 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 28, color: 'var(--white)' }}>MAKE A START</div>
      <label style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 13, color: 'var(--lilac)' }}>
        {`LAP ${lap}`}
        <input ref={sliderRef} type="range" aria-label="Start lap" min={range.min} max={range.max} step={1} value={lap}
          onChange={e => { setLap(Number(e.target.value)); setResult(null) }}
          style={{ display: 'block', width: '100%', minHeight: 44, accentColor: 'var(--volt)' }} />
      </label>
      {sit && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} aria-live="polite">
          <Pill tone="dusk">{`P${sit.position}`}</Pill>
          <Pill tone="dusk">{`${sit.lapsRemaining} LAPS LEFT`}</Pill>
          <Pill tone="dusk"><TyreChip compound={sit.compound as Compound} size={20} /><span>{`${sit.compound}${sit.tyreAge}`}</span></Pill>
          {sit.gapAhead !== null && <Pill tone="dusk">{`+${sit.gapAhead.toFixed(1)}s`}</Pill>}
          {sit.safetyCarOut && <Pill tone="caution">{'⚠ SAFETY CAR'}</Pill>}
        </div>
      )}
      <input aria-label="Start name" maxLength={24} placeholder={defaultStartName(recipe.circuitId, lap)} value={name}
        onChange={e => setName(e.target.value.replace(/[^\x20-\x7E]/g, ''))}
        style={{ minHeight: 44, padding: '0 12px', border: 'none', background: 'var(--dusk)', color: 'var(--white)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 15 }} />
      {result && !result.ok && <div role="alert" style={{ color: 'var(--hot)', fontFamily: 'var(--font-body)', fontWeight: 800 }}>{REFUSAL[result.reason]}</div>}
      {result?.ok && <div style={{ color: 'var(--white)', fontFamily: 'var(--font-body)', fontWeight: 800, letterSpacing: 1 }}>{`FINISH P${result.payload.expect.par - 1} OR BETTER`}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        {!result?.ok
          ? <KitButton variant="primary" size="md" onClick={setStart}>SET START</KitButton>
          : <>
              <KitButton variant="primary" size="md" onClick={save} disabled={saved !== null}>SAVE</KitButton>
              <KitButton variant="secondary" size="md" onClick={() => { void share() }}>SHARE CODE</KitButton>
            </>}
        <KitButton variant="secondary" size="md" onClick={onClose}>CLOSE</KitButton>
      </div>
      <span aria-live="polite" style={{ minHeight: 16, color: 'var(--lilac-dim)', fontSize: 12 }}>{saved ?? ''}</span>
    </motion.div>
    </>
  )
}
