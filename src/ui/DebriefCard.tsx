import { useState } from 'react'
import { motion } from 'framer-motion'
import { useDebriefStore } from '@state/debriefStore'
import { useSettingsStore } from '@state/settingsStore'
import type { Alternative, CallVerdict, JudgedCall, Compound } from '@engine/types'

const TYRE: Record<Compound, string> = { S: 'SOFT', M: 'MEDIUM', H: 'HARD', I: 'INTER', W: 'WET' }
const MAX_ROWS = 3
const mono = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' as const }

export function describeCall(c: JudgedCall): string {
  switch (c.kind) {
    case 'start': return `PLAN · START ON ${TYRE[c.compound]}`
    case 'plan': return `PLAN · PIT L${c.lap} → ${TYRE[c.compound]}`
    case 'pit': return `PIT L${c.lap} → ${TYRE[c.compound]}`
    case 'pace': return `PACE → ${c.mode.toUpperCase()} L${c.lap}`
    default: { const n: never = c; return n }
  }
}

export function describeAlternative(a: Alternative): string {
  switch (a.kind) {
    case 'start': return `start on ${TYRE[a.compound]}`
    case 'plan':
    case 'pit': return `L${a.lap} → ${TYRE[a.compound]}`
    case 'pace': return `${a.mode.toUpperCase()} at L${a.lap}`
    case 'pace-none': return 'no pace change'
    default: { const n: never = a; return n }
  }
}

function Dots({ label, positions }: { label: string; positions: number[] }) {
  return (
    <div role="group" aria-label={label} style={{ ...mono, fontSize: 11, color: 'var(--text-mid)' }}>
      {positions.map((p, i) => <span key={i} style={{ marginRight: 6 }}>P{p}</span>)}
    </div>
  )
}

function Row({ v, index }: { v: CallVerdict; index: number }) {
  const [open, setOpen] = useState(false)
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const better = v.better
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reducedMotion ? 0 : index * 0.08, ease: [0.2, 0, 0, 1] }}
      style={{ padding: '10px 0', borderTop: '1px solid var(--line-hair)' }}
    >
      <button type="button" className="debrief-row-btn" aria-expanded={open} onClick={() => setOpen(o => !o)}
        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
          padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
          color: better ? 'var(--tyre-medium)' : 'var(--accent)' }}>
          {better ? '▲ ' : '✓ '}{describeCall(v.call)}
        </span>
        <span style={{ ...mono, fontSize: 12, color: 'var(--text-mid)' }}>
          {better ? `you avg P${v.actual.meanPosition.toFixed(1)}` : 'GOOD CALL'}
        </span>
      </div>
      {better && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: 12, color: 'var(--text-hi)' }}>Better: {describeAlternative(better.alternative)}</span>
          <span style={{ ...mono, fontSize: 12, color: 'var(--text-hi)' }}>
            {`avg P${better.meanPosition.toFixed(1)} · ${Math.round(better.betterShare * better.positions.length)}/${better.positions.length}`}
          </span>
        </div>
      )}
      </button>
      {open && (
        <div style={{ marginTop: 6, display: 'grid', gap: 2 }}>
          <Dots label="Your call, finishing positions" positions={v.actual.positions} />
          {better && <Dots label="Better option, finishing positions" positions={better.positions} />}
        </div>
      )}
    </motion.div>
  )
}

export function DebriefCard() {
  const { status, done, total, result } = useDebriefStore()
  const shell = { background: 'var(--bg-panel)', border: '1px solid var(--line-hair)', borderRadius: 10, padding: '12px 14px' }
  const title = <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em' }}>YOUR CALLS</span>

  if (status === 'idle') {
    return <div style={{ ...shell, fontSize: 12, color: 'var(--text-dim)' }}>Debrief unavailable for a resumed race.</div>
  }
  if (status === 'failed') {
    return <div style={{ ...shell, fontSize: 12, color: 'var(--text-dim)' }}>Debrief unavailable.</div>
  }
  if (status === 'running' || !result) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    return (
      <div style={shell}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>{title}
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>reviewing…</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <div role="progressbar" aria-label="Reviewing your calls" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} style={{ flex: 1, height: 3, background: 'var(--line-hair)', borderRadius: 2 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
          </div>
          <span style={{ ...mono, fontSize: 11, color: 'var(--text-mid)' }}>{pct}%</span>
        </div>
      </div>
    )
  }

  // First three, plus every later verdict that has a better alternative.
  const shown = result.verdicts.filter((v, i) => i < MAX_ROWS || v.better !== null)
  const hidden = result.verdicts.length - shown.length
  return (
    <div style={shell}>
      <style>{'.debrief-row-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}'}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>{title}
        <span style={{ ...mono, fontSize: 11, color: 'var(--text-dim)' }}>
          {result.verdicts.length} judged · {result.futures} futures</span></div>
      {result.retired && (
        <div style={{ ...mono, fontSize: 11, color: 'var(--text-mid)', marginTop: 4 }}>
          Retired L{result.retired.lap} · {result.retired.cause === 'tyre' ? 'tyre failure' : result.retired.cause}
        </div>
      )}
      {shown.map((v, i) => <Row key={i} v={v} index={i} />)}
      {hidden > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', paddingTop: 8, borderTop: '1px solid var(--line-hair)' }}>
          +{hidden} more judged good
        </div>
      )}
    </div>
  )
}
