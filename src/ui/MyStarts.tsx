import { useEffect, useState } from 'react'
import { Share } from '@capacitor/share'
import { useStartsStore, type SavedStart } from '@state/startsStore'
import { decodeStart } from '@state/startCode'
import { rederive, startChallenge } from '@state/customStart'
import { useScenarioStore } from '@state/scenarioStore'
import { useSeasonStore } from '@state/seasonStore'
import { useUiTap } from '@hooks/useUiTap'
import { loadGameData } from '@data/validators'
import { KitButton, Pill, CircuitOutline } from '@ui/kit'

const GAME = loadGameData()
const IMPORT_ERROR = {
  format: "That isn't a Pit Wall start code.",
  checksum: 'That code is damaged — copy it again in full.',
  newer: 'Update Pit Wall to open this code.',
  invalid: 'That code describes a race this version cannot run.',
  unplayable: 'That start no longer works on this version of Pit Wall.',
} as const

function StartRow({ s }: { s: SavedStart }) {
  const uiTap = useUiTap()
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const d = decodeStart(s.code)
  if (!d.ok) return null
  const p = d.payload
  const circuit = GAME.circuits[p.recipe.circuitId]
  function play() {
    if (!d.ok) return
    const r = rederive(d.payload)
    if (!r || r.parRetired || r.par <= 1) return
    uiTap()
    useScenarioStore.getState().select(startChallenge(s.id, d.payload, r))
    useSeasonStore.getState().startScenarioPhase()
  }
  return (
    <div className="slant-lg" style={{ background: 'var(--grape)', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 24, color: 'var(--white)', overflowWrap: 'anywhere' }}>{p.name}</div>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 12, letterSpacing: 1, color: 'var(--lilac-dim)' }}>
            {`${(circuit?.name ?? '').toUpperCase()} · LAP ${p.startLap} · P${p.expect.position}`}
          </div>
          {s.best && <Pill tone={s.best.met ? 'volt' : 'dusk'}>{`BEST ${s.best.position === null ? 'DNF' : `P${s.best.position}`}${s.best.met ? ' ✓' : ''}`}</Pill>}
        </div>
        <CircuitOutline circuitId={p.recipe.circuitId} width={64} height={48} label={`${circuit?.name ?? ''} layout`} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <KitButton variant="primary" size="sm" onClick={play}>PLAY</KitButton>
        <KitButton variant="secondary" size="sm" ariaLabel={`More for ${p.name}`} onClick={() => setMenu(m => !m)}>⋯</KitButton>
        {menu && <>
          <KitButton variant="secondary" size="sm" onClick={() => { void Share.share({ title: 'Pit Wall start', text: `Try my Pit Wall start "${p.name}": ${s.code}` }).catch(() => {}) }}>SHARE CODE</KitButton>
          <KitButton variant="secondary" size="sm" onClick={() => { const n = window.prompt('Rename start', p.name)?.replace(/[^\x20-\x7E]/g, '').slice(0, 24).trim(); if (n) useStartsStore.getState().rename(s.id, n) }}>RENAME</KitButton>
          <KitButton variant="secondary" size="sm" onClick={() => { if (!confirm) { setConfirm(true); return } useStartsStore.getState().remove(s.id) }}>{confirm ? 'CONFIRM DELETE' : 'DELETE'}</KitButton>
        </>}
      </div>
    </div>
  )
}

export function MyStarts() {
  const starts = useStartsStore(s => s.starts)
  const [text, setText] = useState('')
  const [msg, setMsg] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  useEffect(() => { void useStartsStore.getState().load() }, [])
  function doImport() {
    const r = useStartsStore.getState().importCode(text)
    if (!r.ok) { setMsg({ kind: 'error', text: IMPORT_ERROR[r.reason] }); return }
    setText('')
    setMsg(r.drift ? { kind: 'info', text: 'Made on another version of Pit Wall — this start now plays out differently.' } : null)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input aria-label="Start code" placeholder="Paste a start code" value={text} onChange={e => setText(e.target.value)}
          style={{ flex: 1, minHeight: 44, padding: '0 12px', border: 'none', background: 'var(--dusk)', color: 'var(--white)', fontFamily: 'var(--font-body)', fontWeight: 600 }} />
        <KitButton variant="secondary" size="sm" onClick={doImport}>IMPORT</KitButton>
      </div>
      {msg && <div role={msg.kind === 'error' ? 'alert' : 'status'} style={{ color: msg.kind === 'error' ? 'var(--hot)' : 'var(--lilac)', fontFamily: 'var(--font-body)', fontWeight: 700 }}>{msg.text}</div>}
      {starts.length === 0
        ? <div style={{ color: 'var(--lilac)', fontFamily: 'var(--font-body)' }}>No starts yet. Finish a race and tap MAKE A START, or paste a friend's code.</div>
        : starts.map(s => <StartRow key={s.id} s={s} />)}
    </div>
  )
}
