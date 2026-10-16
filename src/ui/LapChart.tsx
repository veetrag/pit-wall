import { useId, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import type { LapHistory, CarHistory } from '@engine/raceHistory'
import { useReducedMotion, EASE } from '@ui/kit'
import { useUiTap } from '@hooks/useUiTap'
import { useDebriefStore } from '@state/debriefStore'
import { useSeasonStore } from '@state/seasonStore'
import { loadGameData } from '@data/validators'

const DATA = loadGameData()
const CODE = new Map(DATA.drivers.drivers.map(d => [d.id, d.code]))
// Team colours are data (cars.json), like every other team swatch in the UI.
const TEAM_COLOR = new Map(DATA.cars.teams.map(t => [t.id, t.colorPrimary]))

const W = 340
const H = 210
const PAD = { l: 30, r: 10, t: 8, b: 20 }
const HIGHLIGHTED = 5

type Tier = 'player' | 'near' | 'field'
const TIER_RANK: Record<Tier, number> = { field: 0, near: 1, player: 2 }

/** The player plus the four nearest finishers: two ahead, two behind, shifted at P1/P20. Finishing order. */
export function highlightedDrivers(history: LapHistory, playerDriverId: string): string[] {
  const order = [...history.cars].sort((a, b) => a.finish - b.finish).map(c => c.driverId)
  const idx = order.indexOf(playerDriverId)
  if (idx < 0) return []
  const span = Math.min(HIGHLIGHTED, order.length)
  const start = Math.max(0, Math.min(idx - 2, order.length - span))
  return order.slice(start, start + span)
}

/** "Started P7, P4 after the stop on lap 21, finished P3" -- the chart for a screen reader. */
export function lapChartSummary(history: LapHistory, playerDriverId: string): string {
  const car = history.cars.find(c => c.driverId === playerDriverId)
  if (!car) return ''
  const parts = [`Started P${car.positions[0] ?? car.finish}`]
  for (const lap of car.pitLaps) {
    const pos = car.positions[lap]
    if (pos !== undefined) parts.push(`P${pos} after the stop on lap ${lap}`)
  }
  parts.push(car.retiredLap !== null ? `retired on lap ${car.retiredLap}` : `finished P${car.finish}`)
  return parts.join(', ')
}

interface Geometry { x: (lap: number) => number; y: (pos: number) => number }

function geometry(history: LapHistory): Geometry {
  const laps = Math.max(1, history.totalLaps)
  const field = Math.max(2, history.cars.length)
  return {
    x: lap => PAD.l + (lap / laps) * (W - PAD.l - PAD.r),
    y: pos => PAD.t + ((pos - 1) / (field - 1)) * (H - PAD.t - PAD.b),
  }
}

const axisText: CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 700,
  fill: 'var(--lilac-dim)', fontVariantNumeric: 'tabular-nums',
}

function Line({ car, g, tier, colour, reduced }: { car: CarHistory; g: Geometry; tier: Tier; colour: string; reduced: boolean }) {
  const width = tier === 'player' ? 3 : tier === 'near' ? 2 : 1
  const stroke = tier === 'player' ? 'var(--volt)' : tier === 'near' ? colour : 'var(--lilac-dim)'
  const last = car.positions[car.positions.length - 1]
  const points = car.positions.map((p, lap) => `${g.x(lap).toFixed(1)},${g.y(p).toFixed(1)}`).join(' ')
  return (
    <g data-line={car.driverId} data-tier={tier} data-stroke={stroke} data-width={width} style={{ opacity: tier === 'field' ? 0.35 : 1 }}>
      {car.positions.length > 1 && (
        <motion.polyline
          points={points}
          fill="none"
          style={{ stroke, strokeWidth: width, strokeLinejoin: 'round', strokeLinecap: 'round' }}
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.6, ease: EASE }}
        />
      )}
      {car.positions.length === 1 && last !== undefined && (
        <circle cx={g.x(0)} cy={g.y(last)} r={width} style={{ fill: stroke }} />
      )}
      {car.pitLaps.map((lap, i) => {
        const p = car.positions[lap]
        if (p === undefined) return null
        return (
          <circle key={i} data-pit cx={g.x(lap)} cy={g.y(p)} r={tier === 'field' ? 1.5 : tier === 'near' ? 2.5 : 3.5}
            style={{ fill: 'var(--ink)', stroke, strokeWidth: 1.5 }} />
        )
      })}
      {car.retiredLap !== null && last !== undefined && (
        <g data-retired style={{ stroke, strokeWidth: Math.max(1.5, width) }}>
          <line x1={g.x(car.retiredLap) - 3} y1={g.y(last) - 3} x2={g.x(car.retiredLap) + 3} y2={g.y(last) + 3} />
          <line x1={g.x(car.retiredLap) - 3} y1={g.y(last) + 3} x2={g.x(car.retiredLap) + 3} y2={g.y(last) - 3} />
        </g>
      )}
    </g>
  )
}

export function LapChart({ history, playerDriverId }: { history: LapHistory; playerDriverId: string }) {
  const reduced = useReducedMotion()
  const uiTap = useUiTap()
  const hatchId = `vsc-hatch-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [front, setFront] = useState<string | null>(null)

  const g = geometry(history)
  const near = highlightedDrivers(history, playerDriverId)
  const nearSet = new Set(near)
  const tierOf = (id: string): Tier => (id === playerDriverId ? 'player' : nearSet.has(id) ? 'near' : 'field')
  const rankOf = (id: string) => (id === front ? 3 : TIER_RANK[tierOf(id)])
  // Painter's order: faded field, then the four, then the player, then the
  // line the player asked for in front of everything.
  const ordered = [...history.cars].sort((a, b) => rankOf(a.driverId) - rankOf(b.driverId))

  const ticks: number[] = []
  for (let l = 10; l <= history.totalLaps; l += 10) ticks.push(l)
  const field = history.cars.length
  const yLabels = [...new Set([1, Math.min(10, field), field])]
  const summary = lapChartSummary(history, playerDriverId)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={summary}
        data-animated={reduced ? 'false' : 'true'} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: 'var(--caution)', strokeWidth: 2, opacity: 0.55 }} />
          </pattern>
        </defs>
        {/* SC laps a solid caution band, VSC laps a hatched one (spec 1.5 §4). */}
        {[...history.neutralisations].sort((a, b) => Number(a.kind === 'sc') - Number(b.kind === 'sc')).map((n, i) => (
          <rect key={i} data-neutralisation={n.kind}
            x={g.x(n.startLap - 1)} y={PAD.t}
            width={Math.max(1, g.x(n.endLap) - g.x(n.startLap - 1))} height={H - PAD.t - PAD.b}
            style={n.kind === 'sc' ? { fill: 'var(--caution)', opacity: 0.2 } : { fill: `url(#${hatchId})` }} />
        ))}
        {ticks.map(l => <text key={l} x={g.x(l)} y={H - 4} textAnchor="middle" style={axisText}>{`L${l}`}</text>)}
        {yLabels.map(p => <text key={p} x={PAD.l - 6} y={g.y(p) + 3} textAnchor="end" style={axisText}>{`P${p}`}</text>)}
        {ordered.map(car => (
          <Line key={car.driverId} car={car} g={g} tier={tierOf(car.driverId)}
            colour={TEAM_COLOR.get(car.teamId) ?? 'var(--lilac)'} reduced={reduced} />
        ))}
      </svg>

      <div role="group" aria-label="Highlight a driver" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {near.map(id => {
          const on = front === id
          const teamId = history.cars.find(c => c.driverId === id)?.teamId ?? ''
          const code = CODE.get(id) ?? id
          return (
            <button key={id} type="button" className="kit-focus" aria-pressed={on} aria-label={`Bring ${code} to the front`}
              onClick={() => { uiTap(); setFront(on ? null : id) }}
              style={{
                minHeight: 44, minWidth: 56, padding: '0 10px', border: 'none', borderRadius: 999, cursor: 'pointer',
                background: on ? 'var(--white)' : 'var(--night)', color: on ? 'var(--ink)' : 'var(--white)',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 13,
              }}>
              <span aria-hidden="true" style={{
                width: 4, height: 16, transform: 'skewX(-14deg)',
                background: id === playerDriverId ? 'var(--volt)' : (TEAM_COLOR.get(teamId) ?? 'var(--lilac)'),
              }} />
              {code}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** The result-screen card. Nothing without a history: a race resumed from a save has no replay to chart. */
export function LapChartCard() {
  const history = useDebriefStore(s => s.history)
  const playerDriverId = useSeasonStore(s => s.playerDriverId)
  if (!history || !playerDriverId) return null
  return (
    <section aria-label="Lap chart" style={{ background: 'var(--grape)', border: '1px solid var(--line-hair)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--lilac-dim)', letterSpacing: '0.12em' }}>LAP CHART</span>
        <span aria-hidden="true" style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--lilac-dim)' }}>● stop · × out · ▮ SC · ▨ VSC</span>
      </div>
      <LapChart history={history} playerDriverId={playerDriverId} />
    </section>
  )
}
