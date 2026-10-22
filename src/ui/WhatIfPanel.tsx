import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useDebriefStore } from '@state/debriefStore'
import { playerStops, whatIfLapRange, addStopLapRange, whatIfInputs, replay, type WhatIfEdit, type WhatIfResult } from '@engine/debrief'
import { initRace } from '@engine/race'
import type { Compound } from '@engine/types'
import { KitButton, TyreChip, TYRE_NAME, PRESS, useReducedMotion, snapIn } from '@ui/kit'
import { useUiTap } from '@hooks/useUiTap'

const COMPOUNDS: Compound[] = ['S', 'M', 'H', 'I', 'W']
const posText = (p: number, field: number) => (p > field ? 'DNF' : `P${p}`)

/** Typical = median (lower middle of the sorted futures, so one DNF cannot drag it); range = best to worst. */
export function futuresSummary(positions: readonly number[], fieldSize: number): { typical: string; range: string } {
  const s = [...positions].sort((a, b) => a - b)
  const median = s[Math.floor((s.length - 1) / 2)] ?? 0
  return { typical: posText(median, fieldSize), range: `${posText(s[0] ?? 0, fieldSize)}–${posText(s[s.length - 1] ?? 0, fieldSize)}` }
}

/** "Better in N" counts futures where the edited plan finished strictly ahead in the same future. */
export function whatIfLines(r: WhatIfResult, fieldSize: number): { mine: string; theirs: string } {
  const m = futuresSummary(r.mine, fieldSize)
  const t = futuresSummary(r.theirs, fieldSize)
  const better = r.theirs.filter((p, k) => p < (r.mine[k] ?? Infinity)).length
  const tail = better === 0 ? 'never better' : `better in ${better} of ${r.theirs.length} futures`
  return { mine: `Your plan: ${m.typical} (${m.range})`, theirs: `This plan: ${t.typical} (${t.range}) · ${tail}` }
}

const STEP = { minWidth: 48, minHeight: 48, border: 'none', cursor: 'pointer', background: 'var(--dusk)', color: 'var(--white)',
  fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22 } as const

/** Compounds the player still has a set of at the branch point of this edit. */
function legalAtBranch(job: NonNullable<ReturnType<typeof useDebriefStore.getState>['job']>, edit: WhatIfEdit): Compound[] {
  try {
    const { branchStep } = whatIfInputs(job.config, job.seed, job.calls, edit)
    const me = replay(job.config, job.seed, job.calls, branchStep).state.cars.find(c => c.isPlayer)
    return COMPOUNDS.filter(c => (me?.tyreAllocation[c] ?? 0) > 0)
  } catch { return [] }
}

/** TRY ANOTHER PLAN (spec 1.6 §5): one stop's lap and/or tyre, or add a stop when there was none. */
export function WhatIfPanel() {
  const job = useDebriefStore(s => s.job)
  const wi = useDebriefStore(s => s.whatIf)
  const runWhatIf = useDebriefStore(s => s.runWhatIf)
  const reduced = useReducedMotion()
  const uiTap = useUiTap()

  // One replay of the race per job, not per render.
  const model = useMemo(() => {
    if (!job) return null
    const start = initRace(job.config)
    return { stops: playerStops(job.config, job.seed, job.calls), totalLaps: start.totalLaps, field: start.cars.length }
  }, [job])

  const [stopIdx, setStopIdx] = useState(0)
  const [lap, setLap] = useState(() => model?.stops[0]?.lap ?? Math.round((model?.totalLaps ?? 20) / 2))
  const [picked, setPicked] = useState<Compound | null>(null)

  const adding = !!model && model.stops.length === 0
  const stop = model?.stops[stopIdx]
  const want: Compound = picked ?? stop?.compound ?? 'H'
  // The branch step depends on stop and lap only, never on the tyre.
  const legal = useMemo(
    () => (job ? legalAtBranch(job, adding ? { kind: 'add', lap, compound: 'H' } : { kind: 'stop', stop: stopIdx, lap, compound: 'H' }) : []),
    [job, adding, stopIdx, lap],
  )
  if (!job || !model) return null

  const compound: Compound = legal.includes(want) ? want : (legal[0] ?? want)
  const range = adding
    ? addStopLapRange(model.totalLaps)
    : whatIfLapRange(model.stops, stopIdx, model.totalLaps, job.config.tuning.debrief.whatIfMaxShift)
  const changed = adding || (stop !== undefined && (lap !== stop.lap || compound !== stop.compound))
  const edit: WhatIfEdit = adding ? { kind: 'add', lap, compound } : { kind: 'stop', stop: stopIdx, lap, compound }
  const pick = (i: number) => { const s = model.stops[i]; if (!s) return; uiTap(); setStopIdx(i); setLap(s.lap); setPicked(null) }
  const running = wi.status === 'running'
  // The read-out belongs to the edit that produced it; stale once the controls move.
  const e = wi.edit
  const matches = !!e && e.kind === edit.kind && e.lap === edit.lap && e.compound === edit.compound
    && (e.kind !== 'stop' || (edit.kind === 'stop' && e.stop === edit.stop))
  const lines = wi.status === 'done' && wi.result && matches ? whatIfLines(wi.result, model.field) : null
  const futures = job.config.tuning.debrief.futures
  const tap = reduced ? undefined : { scale: 0.96 }

  return (
    <motion.div {...snapIn(reduced)} role="region" aria-label="Try another plan"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line-hair)' }}>
      <style>{'@keyframes whatif-sweep{from{transform:translateX(-100%)}to{transform:translateX(250%)}}'}</style>
      {model.stops.length > 1 && (
        <div role="group" aria-label="Which stop" style={{ display: 'flex', gap: 6 }}>
          {model.stops.map((s, i) => (
            <motion.button key={i} type="button" className="slant-sm kit-focus" aria-pressed={i === stopIdx}
              whileTap={tap} transition={PRESS} onClick={() => pick(i)}
              style={{ ...STEP, flex: 1, fontSize: 14, fontFamily: 'var(--font-body)', fontWeight: 800,
                background: i === stopIdx ? 'var(--white)' : 'var(--dusk)', color: i === stopIdx ? 'var(--ink)' : 'var(--white)' }}>
              STOP {i + 1} · L{s.lap}
            </motion.button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--lilac-dim)', letterSpacing: '0.12em' }}>{adding ? 'ADD A STOP ON' : 'BOX ON'}</span>
        <motion.button type="button" className="slant-sm kit-focus" aria-label="One lap earlier" disabled={lap <= range[0] || running}
          whileTap={tap} transition={PRESS} onClick={() => { uiTap(); setLap(l => Math.max(range[0], l - 1)) }} style={STEP}>−</motion.button>
        <span aria-live="polite" style={{ minWidth: 64, textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 900,
          fontStyle: 'italic', fontSize: 26, color: 'var(--white)', fontVariantNumeric: 'tabular-nums' }}>L{lap}</span>
        <motion.button type="button" className="slant-sm kit-focus" aria-label="One lap later" disabled={lap >= range[1] || running}
          whileTap={tap} transition={PRESS} onClick={() => { uiTap(); setLap(l => Math.min(range[1], l + 1)) }} style={STEP}>+</motion.button>
      </div>
      <div role="radiogroup" aria-label="Tyre" style={{ display: 'flex', gap: 6 }}>
        {legal.map(c => (
          <motion.button key={c} type="button" role="radio" aria-checked={c === compound} aria-label={TYRE_NAME[c]} className="kit-focus"
            disabled={running} whileTap={tap} transition={PRESS} onClick={() => { uiTap(); setPicked(c) }}
            style={{ ...STEP, borderRadius: 999, background: c === compound ? 'var(--grape)' : 'transparent',
              boxShadow: c === compound ? 'inset 0 0 0 2px var(--volt)' : 'none' }}>
            <TyreChip compound={c} size={30} />
          </motion.button>
        ))}
        {legal.length === 0 && <span style={{ fontSize: 12, color: 'var(--lilac-dim)' }}>No tyre sets left at that point.</span>}
      </div>
      <KitButton variant="primary" size="sm" disabled={!changed || running || legal.length === 0} onClick={() => runWhatIf(edit)}
        ariaLabel={`Run ${futures} futures`}>
        {running ? 'RUNNING…' : `RUN ${futures} FUTURES`}
      </KitButton>
      {running && (
        <div role="progressbar" aria-label="Running futures" style={{ height: 3, background: 'var(--line-hair)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: reduced ? '100%' : '40%', height: '100%', background: 'var(--volt)', borderRadius: 2,
            animation: reduced ? undefined : 'whatif-sweep 1s cubic-bezier(0.2,0,0,1) infinite' }} />
        </div>
      )}
      {wi.status === 'failed' && <span role="status" style={{ fontSize: 12, color: 'var(--lilac-dim)' }}>Couldn't run that plan. Try a different lap or tyre.</span>}
      {lines && (
        <div role="status" style={{ display: 'grid', gap: 4, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ fontSize: 13, color: 'var(--lilac)' }}>{lines.mine}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)' }}>{lines.theirs}</span>
        </div>
      )}
    </motion.div>
  )
}
