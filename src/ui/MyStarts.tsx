import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Share } from '@capacitor/share'
import { useStartsStore, type SavedStart } from '@state/startsStore'
import { decodeStart, validatePayload } from '@state/startCode'
import { rederive, startChallenge } from '@state/customStart'
import { useScenarioStore } from '@state/scenarioStore'
import { useSeasonStore } from '@state/seasonStore'
import { useSettingsStore } from '@state/settingsStore'
import { loadGameData } from '@data/validators'
import { KitButton, Pill, CircuitOutline, TyreChip, snapIn } from '@ui/kit'
import type { Compound } from '@engine/types'

const GAME = loadGameData()
const IMPORT_ERROR = {
  format: "That isn't a Pit Wall start code.",
  checksum: 'That code is damaged — copy it again in full.',
  newer: 'Update Pit Wall to open this code.',
  invalid: 'That code describes a race this version cannot run.',
  unplayable: 'That start no longer works on this version of Pit Wall.',
} as const
const DRIFT = 'Made on another version of Pit Wall — this start now plays out differently.'

type Msg = { kind: 'error' | 'info'; text: string }

/** A short status line that snaps in (opacity only under reduced motion). */
function Message({ msg, reduced }: { msg: Msg; reduced: boolean }) {
  return (
    <motion.div {...snapIn(reduced)} role={msg.kind === 'error' ? 'alert' : 'status'}
      style={{ color: msg.kind === 'error' ? 'var(--hot)' : 'var(--lilac)', fontFamily: 'var(--font-body)', fontWeight: 700 }}>
      {msg.kind === 'error' ? '⚠ ' : ''}{msg.text}
    </motion.div>
  )
}

function StartRow({ s, index, reduced }: { s: SavedStart; index: number; reduced: boolean }) {
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [driftAsk, setDriftAsk] = useState(false)
  const [msg, setMsg] = useState<Msg | null>(null)
  // Format + checksum only: a start this build cannot play stays listed, explained (spec R23).
  const d = useMemo(() => decodeStart(s.code, { validate: false }), [s.code])
  // The start as THIS build plays it, once per code; null = no longer playable here.
  const r = useMemo(() => {
    if (!d.ok || !validatePayload(d.payload)) return null
    try { const x = rederive(d.payload); return x && !x.parRetired && x.par > 1 ? x : null } catch { return null }
  }, [d])
  if (!d.ok) return null
  const p = d.payload
  const circuit = GAME.circuits[p.recipe.circuitId]
  function begin(force: boolean) {
    if (!r) { setMsg({ kind: 'error', text: IMPORT_ERROR.unplayable }); return }
    if (r.drift && !force) { setDriftAsk(true); return }
    setDriftAsk(false)
    useScenarioStore.getState().select(startChallenge(s.id, p, r))
    useSeasonStore.getState().startScenarioPhase()
  }
  function share() {
    Share.share({ title: 'Pit Wall start', text: `Try my Pit Wall start "${p.name}": ${s.code}` })
      .catch(() => setMsg({ kind: 'error', text: `Couldn't open sharing. Your code: ${s.code}` }))
  }
  return (
    <motion.div {...snapIn(reduced, index)} className="slant-lg" style={{ background: 'var(--grape)', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 24, color: 'var(--white)', overflowWrap: 'anywhere' }}>{p.name}</div>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 12, letterSpacing: 1, color: 'var(--lilac-dim)' }}>
            {`${(circuit?.name ?? p.recipe.circuitId).toUpperCase()} · LAP ${p.startLap}`}
          </div>
          {r
            ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <Pill tone="dusk">{`P${r.situation.position}`}</Pill>
                <Pill tone="dusk">{`${r.situation.lapsRemaining} LAPS LEFT`}</Pill>
                <Pill tone="dusk"><TyreChip compound={r.situation.compound as Compound} size={18} /><span>{r.situation.compound}</span></Pill>
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12, letterSpacing: 1, color: 'var(--white)' }}>{`FINISH P${Math.max(1, r.par - 1)} OR BETTER`}</span>
              </div>
            : <div data-testid="start-unplayable" style={{ color: 'var(--hot)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13 }}>{`⚠ ${IMPORT_ERROR.unplayable}`}</div>}
          {s.best && <Pill tone={s.best.met ? 'volt' : 'dusk'}>{`BEST ${s.best.position === null ? 'DNF' : `P${s.best.position}`}${s.best.met ? ' ✓' : ''}`}</Pill>}
        </div>
        <CircuitOutline circuitId={p.recipe.circuitId} width={64} height={48} label={`${circuit?.name ?? ''} layout`} />
      </div>
      <AnimatePresence initial={false}>
        {driftAsk && (
          <motion.div key="drift" {...snapIn(reduced)} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div role="status" style={{ color: 'var(--caution)', fontFamily: 'var(--font-body)', fontWeight: 700 }}>⚠ {DRIFT}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <KitButton variant="primary" size="sm" onClick={() => begin(true)}>PLAY ANYWAY</KitButton>
              <KitButton variant="secondary" size="sm" onClick={() => setDriftAsk(false)}>CANCEL</KitButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {msg && <Message msg={msg} reduced={reduced} />}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!driftAsk && <KitButton variant="primary" size="sm" onClick={() => begin(false)}>PLAY</KitButton>}
        <KitButton variant="secondary" size="sm" ariaLabel={`More for ${p.name}`} ariaExpanded={menu} onClick={() => setMenu(m => !m)}>⋯</KitButton>
        {menu && <>
          <KitButton variant="secondary" size="sm" onClick={share}>SHARE CODE</KitButton>
          <KitButton variant="secondary" size="sm" onClick={() => { const n = window.prompt('Rename start', p.name)?.replace(/[^\x20-\x7E]/g, '').slice(0, 24).trim(); if (n) useStartsStore.getState().rename(s.id, n) }}>RENAME</KitButton>
          <KitButton variant="secondary" size="sm" onClick={() => { if (!confirm) { setConfirm(true); return } useStartsStore.getState().remove(s.id) }}>{confirm ? 'CONFIRM DELETE' : 'DELETE'}</KitButton>
        </>}
      </div>
    </motion.div>
  )
}

export function MyStarts() {
  const starts = useStartsStore(s => s.starts)
  const reduced = useSettingsStore(s => s.reducedMotion)
  const [text, setText] = useState('')
  const [msg, setMsg] = useState<Msg | null>(null)
  useEffect(() => { void useStartsStore.getState().load() }, [])
  function doImport() {
    const r = useStartsStore.getState().importCode(text)
    if (!r.ok) { setMsg({ kind: 'error', text: IMPORT_ERROR[r.reason] }); return }
    setText('')
    setMsg(r.drift ? { kind: 'info', text: DRIFT } : null)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input aria-label="Start code" placeholder="Paste a start code" value={text} onChange={e => setText(e.target.value)}
          className="kit-focus"
          style={{ flex: 1, minHeight: 44, padding: '0 12px', border: 'none', background: 'var(--dusk)', color: 'var(--white)', fontFamily: 'var(--font-body)', fontWeight: 600 }} />
        <KitButton variant="secondary" size="sm" onClick={doImport}>IMPORT</KitButton>
      </div>
      {msg && <Message key={msg.text} msg={msg} reduced={reduced} />}
      {starts.length === 0
        ? <div style={{ color: 'var(--lilac)', fontFamily: 'var(--font-body)' }}>No starts yet. Finish a race and tap MAKE A START, or paste a friend's code.</div>
        : starts.map((s, i) => <StartRow key={s.id} s={s} index={i} reduced={reduced} />)}
    </div>
  )
}
