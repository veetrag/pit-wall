import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import { useUiTap } from '@hooks/useUiTap'
import driversData from '@data/drivers.json'
import carsData from '@data/cars.json'
import rivalriesData from '@data/rivalries.json'

// ─── Types ────────────────────────────────────────────────────────────────────

type DriverFacets = {
  pace: number; racecraft: number; tyreManagement: number
  consistency: number; wetWeather: number; experience: number
}
type TeamFacets = {
  power: number; aero: number; handling: number; reliability: number; pitCrew: number
}
type Driver = {
  id: string; name: string; code: string; teamId: string; facets: DriverFacets
  potential?: number; age?: number; nationality?: string; flag?: string
  archetype?: string; bio?: string; backstory?: string
}
type Team = {
  id: string; name: string; colorPrimary: string; colorSecondary: string; facets: TeamFacets
  nationality?: string; flag?: string; archetype?: string; history?: string
}
type Rivalry = { a: string; b: string; note: string }

const drivers = driversData.drivers as Driver[]
const teams   = carsData.teams as Team[]
const rivalries = rivalriesData.rivalries as Rivalry[]

function rivalriesFor(driverId: string): { rival: Driver; note: string }[] {
  return rivalries
    .filter(r => r.a === driverId || r.b === driverId)
    .map(r => {
      const rivalId = r.a === driverId ? r.b : r.a
      const rival = drivers.find(d => d.id === rivalId)
      return rival ? { rival, note: r.note } : null
    })
    .filter((x): x is { rival: Driver; note: string } => x !== null)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEAM_COLOR_MAP: Record<string, string> = Object.fromEntries(
  (carsData.teams as Team[]).map(t => [t.id, t.colorPrimary])
)

function teamColor(teamId: string) { return TEAM_COLOR_MAP[teamId] ?? '#888' }
function teamName(teamId: string)  { return teams.find(t => t.id === teamId)?.name ?? teamId }

// ─── Radar polygon ────────────────────────────────────────────────────────────

type RadarDatum = { label: string; value: number; dormant?: boolean }

function RadarChart({ data, color, size = 140, compareData, compareColor }: {
  data: RadarDatum[]; color: string; size?: number
  compareData?: RadarDatum[]; compareColor?: string
}) {
  const cx = size / 2
  const cy = size / 2
  const maxR = size * 0.42
  const n = data.length
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2

  // Grid rings
  const rings = [0.25, 0.5, 0.75, 1.0]
  // Data polygon points
  const pts = data.map((d, i) => {
    const r = (d.value / 100) * maxR
    return `${cx + r * Math.cos(angle(i))},${cy + r * Math.sin(angle(i))}`
  })
  const comparePts = compareData?.map((d, i) => {
    const r = (d.value / 100) * maxR
    return `${cx + r * Math.cos(angle(i))},${cy + r * Math.sin(angle(i))}`
  })
  // Axis lines to each vertex at 100%
  const axes = data.map((_, i) => ({
    x2: cx + maxR * Math.cos(angle(i)),
    y2: cy + maxR * Math.sin(angle(i)),
  }))
  // Label positions (slightly beyond maxR)
  const labelR = maxR + 14
  const labels = data.map((d, i) => ({
    x: cx + labelR * Math.cos(angle(i)),
    y: cy + labelR * Math.sin(angle(i)),
    label: d.label,
    dormant: d.dormant,
  }))

  return (
    <svg width={size + 28} height={size + 28} viewBox={`-14 -14 ${size + 28} ${size + 28}`}>
      {/* Grid rings */}
      {rings.map(r => (
        <polygon
          key={r}
          points={data.map((_, i) => {
            const pr = r * maxR
            return `${cx + pr * Math.cos(angle(i))},${cy + pr * Math.sin(angle(i))}`
          }).join(' ')}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="1"
        />
      ))}
      {/* Axis lines */}
      {axes.map((a, i) => (
        <line key={i} x1={cx} y1={cy} x2={a.x2} y2={a.y2}
          stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      ))}
      {/* Compare polygon drawn first, underneath the primary one */}
      {comparePts && compareColor && (
        <motion.polygon
          initial={{ opacity: 0, scale: 0.2 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 22, delay: 0.05 }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
          points={comparePts.join(' ')}
          fill={`${compareColor}22`}
          stroke={compareColor}
          strokeWidth="1.5"
          strokeDasharray="3 2"
          strokeLinejoin="round"
        />
      )}
      {/* Filled data polygon */}
      <motion.polygon
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22, delay: 0.05 }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
        points={pts.join(' ')}
        fill={`${color}30`}
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Vertex dots */}
      {data.map((d, i) => {
        const r = (d.value / 100) * maxR
        return (
          <motion.circle
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 + i * 0.04 }}
            cx={cx + r * Math.cos(angle(i))}
            cy={cy + r * Math.sin(angle(i))}
            r={3}
            fill={color}
          />
        )
      })}
      {/* Labels */}
      {labels.map((l, i) => (
        <text
          key={i}
          x={l.x} y={l.y}
          textAnchor="middle" dominantBaseline="middle"
          fontSize="7.5"
          fontFamily="var(--font-mono)"
          letterSpacing="0.5"
          fill={l.dormant ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.55)'}
        >
          {l.label}
        </text>
      ))}
    </svg>
  )
}

// ─── Facet bar ────────────────────────────────────────────────────────────────

function FacetBar({ label, value, color, dormant }: { label: string; value: number; color: string; dormant?: boolean }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
          color: dormant ? 'var(--text-dim)' : 'var(--text-mid)',
        }}>
          {label}{dormant ? ' ·' : ''}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: dormant ? 'var(--text-dim)' : 'var(--text-hi)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {dormant ? '—' : value}
        </span>
      </div>
      <div style={{
        height: 4, borderRadius: 2,
        background: 'rgba(255,255,255,0.07)',
        overflow: 'hidden',
      }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: dormant ? '0%' : `${value}%` }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
          style={{
            height: '100%', borderRadius: 2,
            background: dormant ? 'rgba(255,255,255,0.15)' : color,
            opacity: dormant ? 0.4 : 1,
          }}
        />
      </div>
    </div>
  )
}

// ─── Driver detail card ───────────────────────────────────────────────────────

function DriverCard({ driver }: { driver: Driver }) {
  const color = teamColor(driver.teamId)
  const radarData: RadarDatum[] = [
    { label: 'PACE',     value: driver.facets.pace },
    { label: 'CRAFT',    value: driver.facets.racecraft },
    { label: 'TYRES',    value: driver.facets.tyreManagement },
    { label: 'CONSIST',  value: driver.facets.consistency },
    { label: 'WET',      value: driver.facets.wetWeather,   dormant: true },
    { label: 'EXP',      value: driver.facets.experience },
  ]
  const rivals = rivalriesFor(driver.id)

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      style={{ overflow: 'hidden' }}
    >
      <div style={{
        background: `linear-gradient(135deg, ${color}12 0%, var(--bg-panel) 100%)`,
        border: `1px solid ${color}44`,
        borderTop: 'none',
        borderRadius: '0 0 12px 12px',
        padding: '16px',
        marginTop: -2,
      }}>
        {(driver.archetype || driver.backstory) && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              {driver.flag && <span style={{ fontSize: 13 }}>{driver.flag}</span>}
              {driver.archetype && (
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, color, letterSpacing: '0.02em' }}>
                  {driver.archetype}
                </span>
              )}
            </div>
            {driver.backstory && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--text-mid)', lineHeight: 1.5, margin: 0 }}>
                {driver.backstory}
              </p>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Radar */}
          <div style={{ flexShrink: 0 }}>
            <RadarChart data={radarData} color={color} size={140} />
          </div>
          {/* Bars */}
          <div style={{ flex: 1, paddingTop: 8 }}>
            <FacetBar label="PACE"        value={driver.facets.pace}           color={color} />
            <FacetBar label="RACECRAFT"   value={driver.facets.racecraft}      color={color} />
            <FacetBar label="TYRE MGMT"   value={driver.facets.tyreManagement} color={color} />
            <FacetBar label="CONSISTENCY" value={driver.facets.consistency}    color={color} />
            <FacetBar label="WET WEATHER" value={driver.facets.wetWeather}     color={color} dormant />
            <FacetBar label="EXPERIENCE"  value={driver.facets.experience}     color={color} />
          </div>
        </div>
        {/* Hints */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {driver.facets.tyreManagement >= 85 && (
            <span style={hintStyle}>🟢 Elite tyre manager — stints run ~2–3 laps longer</span>
          )}
          {driver.facets.racecraft >= 88 && (
            <span style={hintStyle}>⚔️ High racecraft — hard to pass, deadly when attacking</span>
          )}
          {driver.facets.consistency <= 72 && (
            <span style={hintStyle}>⚡ Inconsistent — high ceiling, high scatter</span>
          )}
          {driver.facets.wetWeather >= 88 && (
            <span style={{ ...hintStyle, opacity: 0.5 }}>💧 Wet weather ace (dormant in v1)</span>
          )}
        </div>
        {/* Rivalries */}
        {rivals.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, color: 'var(--accent-warm)', letterSpacing: '0.15em', marginBottom: 6 }}>
              RIVALS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {rivals.map(({ rival, note }) => (
                <div key={rival.id} style={{
                  display: 'flex', alignItems: 'baseline', gap: 6,
                  fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-mid)',
                }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: teamColor(rival.teamId), flexShrink: 0 }}>
                    {rival.flag} {rival.code}
                  </span>
                  <span>{note}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─── Car detail card ──────────────────────────────────────────────────────────

function CarCard({ team }: { team: Team }) {
  const color = team.colorPrimary
  const f = team.facets
  const radarData: RadarDatum[] = [
    { label: 'POWER',    value: f.power },
    { label: 'AERO',     value: f.aero },
    { label: 'HANDLING', value: f.handling },
    { label: 'CREW',     value: f.pitCrew },
    { label: 'RELI',     value: f.reliability, dormant: true },
  ]

  // Per-sector strength
  const sectors: { label: string; val: number; key: string }[] = [
    { label: 'S1 POWER SECTOR',    val: f.power,    key: 's1' },
    { label: 'S2 AERO SECTOR',     val: f.aero,     key: 's2' },
    { label: 'S3 HANDLING SECTOR', val: f.handling, key: 's3' },
  ]
  const strongest = [...sectors].sort((a, b) => b.val - a.val)[0]!
  const weakest   = [...sectors].sort((a, b) => a.val - b.val)[0]!

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      style={{ overflow: 'hidden' }}
    >
      <div style={{
        background: `linear-gradient(135deg, ${color}12 0%, var(--bg-panel) 100%)`,
        border: `1px solid ${color}44`,
        borderTop: 'none',
        borderRadius: '0 0 12px 12px',
        padding: '16px',
        marginTop: -2,
      }}>
        {(team.archetype || team.history) && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              {team.flag && <span style={{ fontSize: 13 }}>{team.flag}</span>}
              {team.archetype && (
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, color, letterSpacing: '0.02em' }}>
                  {team.archetype}
                </span>
              )}
            </div>
            {team.history && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--text-mid)', lineHeight: 1.5, margin: 0 }}>
                {team.history}
              </p>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Radar */}
          <div style={{ flexShrink: 0 }}>
            <RadarChart data={radarData} color={color} size={140} />
          </div>
          {/* Bars */}
          <div style={{ flex: 1, paddingTop: 8 }}>
            <FacetBar label="POWER"       value={f.power}       color={color} />
            <FacetBar label="AERO"        value={f.aero}        color={color} />
            <FacetBar label="HANDLING"    value={f.handling}    color={color} />
            <FacetBar label="PIT CREW"    value={f.pitCrew}     color={color} />
            <FacetBar label="RELIABILITY" value={f.reliability} color={color} dormant />
          </div>
        </div>
        {/* Per-sector readout */}
        <div style={{
          marginTop: 14, padding: '10px 12px', borderRadius: 8,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 6 }}>
            SECTOR CHARACTER
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {sectors.map(s => (
              <div key={s.key} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)',
                  letterSpacing: '0.1em', marginBottom: 4,
                }}>{s.label.split(' ')[0]}</div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700,
                  color: s.val === strongest.val ? color : s.val === weakest.val ? 'var(--accent-warm)' : 'var(--text-hi)',
                  fontVariantNumeric: 'tabular-nums',
                }}>{s.val}</div>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-dim)', marginTop: 8 }}>
            Strong in {strongest.label.toLowerCase()} · Weak in {weakest.label.toLowerCase()}
          </div>
        </div>
        {f.pitCrew >= 88 && (
          <div style={{ ...hintStyle, marginTop: 10 }}>🔧 Elite pit crew — fast, consistent stops aid undercut</div>
        )}
      </div>
    </motion.div>
  )
}

const hintStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-mid)',
  background: 'rgba(255,255,255,0.05)', borderRadius: 6,
  padding: '4px 8px', display: 'inline-block',
}

// ─── Comparison view ──────────────────────────────────────────────────────────

function CompareFacetRow({ label, valueA, valueB, colorA, colorB }: {
  label: string; valueA: number; valueB: number; colorA: string; colorB: string
}) {
  const delta = valueA - valueB
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 60px 1fr 32px', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: colorA, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{valueA}</span>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: `${valueA}%`, height: '100%', background: colorA }} />
      </div>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em', textAlign: 'center',
        color: 'var(--text-dim)',
      }}>
        {label}
      </span>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ width: `${valueB}%`, height: '100%', background: colorB }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: colorB, fontVariantNumeric: 'tabular-nums' }}>{valueB}</span>
      <div style={{ gridColumn: '1 / -1', textAlign: 'center', marginTop: 1 }}>
        {delta !== 0 && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 8,
            color: delta > 0 ? colorA : colorB,
          }}>
            {delta > 0 ? '◀' : '▶'} {Math.abs(delta)}
          </span>
        )}
      </div>
    </div>
  )
}

function CompareHeader({ a, b, colorA, colorB, nameA, nameB, subA, subB }: {
  a: string; b: string; colorA: string; colorB: string; nameA: string; nameB: string; subA?: string; subB?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{ flex: 1, textAlign: 'left' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: colorA }}>{a}</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-dim)' }}>{nameA}</div>
        {subA && <div style={{ fontFamily: 'var(--font-body)', fontSize: 9, color: 'var(--text-dim)' }}>{subA}</div>}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em', flexShrink: 0, padding: '0 10px' }}>VS</div>
      <div style={{ flex: 1, textAlign: 'right' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: colorB }}>{b}</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-dim)' }}>{nameB}</div>
        {subB && <div style={{ fontFamily: 'var(--font-body)', fontSize: 9, color: 'var(--text-dim)' }}>{subB}</div>}
      </div>
    </div>
  )
}

function DriverCompareView({ a, b, onClose }: { a: Driver; b: Driver; onClose: () => void }) {
  const colorA = teamColor(a.teamId)
  const colorB = teamColor(b.teamId)
  const radarA: RadarDatum[] = [
    { label: 'PACE', value: a.facets.pace }, { label: 'CRAFT', value: a.facets.racecraft },
    { label: 'TYRES', value: a.facets.tyreManagement }, { label: 'CONSIST', value: a.facets.consistency },
    { label: 'WET', value: a.facets.wetWeather, dormant: true }, { label: 'EXP', value: a.facets.experience },
  ]
  const radarB: RadarDatum[] = [
    { label: 'PACE', value: b.facets.pace }, { label: 'CRAFT', value: b.facets.racecraft },
    { label: 'TYRES', value: b.facets.tyreManagement }, { label: 'CONSIST', value: b.facets.consistency },
    { label: 'WET', value: b.facets.wetWeather, dormant: true }, { label: 'EXP', value: b.facets.experience },
  ]
  const mutualRivalry = rivalries.find(r => (r.a === a.id && r.b === b.id) || (r.a === b.id && r.b === a.id))

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--line-hair)',
        borderRadius: 12, padding: 16, marginBottom: 14,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.15em' }}>COMPARING</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>
      <CompareHeader
        a={a.code} b={b.code} colorA={colorA} colorB={colorB}
        nameA={a.name} nameB={b.name}
        subA={a.archetype} subB={b.archetype}
      />
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
        <RadarChart data={radarA} color={colorA} compareData={radarB} compareColor={colorB} size={150} />
      </div>
      <CompareFacetRow label="PACE"     valueA={a.facets.pace}           valueB={b.facets.pace}           colorA={colorA} colorB={colorB} />
      <CompareFacetRow label="CRAFT"    valueA={a.facets.racecraft}      valueB={b.facets.racecraft}      colorA={colorA} colorB={colorB} />
      <CompareFacetRow label="TYRES"    valueA={a.facets.tyreManagement} valueB={b.facets.tyreManagement} colorA={colorA} colorB={colorB} />
      <CompareFacetRow label="CONSIST"  valueA={a.facets.consistency}    valueB={b.facets.consistency}    colorA={colorA} colorB={colorB} />
      <CompareFacetRow label="EXP"      valueA={a.facets.experience}     valueB={b.facets.experience}     colorA={colorA} colorB={colorB} />
      {mutualRivalry && (
        <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(255,77,94,0.08)', border: '1px solid rgba(255,77,94,0.3)', borderRadius: 8 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, color: 'var(--accent-warm)', letterSpacing: '0.12em', marginBottom: 3 }}>RIVALRY</div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-mid)' }}>{mutualRivalry.note}</div>
        </div>
      )}
    </motion.div>
  )
}

function TeamCompareView({ a, b, onClose }: { a: Team; b: Team; onClose: () => void }) {
  const colorA = a.colorPrimary
  const colorB = b.colorPrimary
  const radarA: RadarDatum[] = [
    { label: 'POWER', value: a.facets.power }, { label: 'AERO', value: a.facets.aero },
    { label: 'HANDLING', value: a.facets.handling }, { label: 'CREW', value: a.facets.pitCrew },
    { label: 'RELI', value: a.facets.reliability, dormant: true },
  ]
  const radarB: RadarDatum[] = [
    { label: 'POWER', value: b.facets.power }, { label: 'AERO', value: b.facets.aero },
    { label: 'HANDLING', value: b.facets.handling }, { label: 'CREW', value: b.facets.pitCrew },
    { label: 'RELI', value: b.facets.reliability, dormant: true },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--line-hair)',
        borderRadius: 12, padding: 16, marginBottom: 14,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.15em' }}>COMPARING</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>
      <CompareHeader
        a={a.flag ?? ''} b={b.flag ?? ''} colorA={colorA} colorB={colorB}
        nameA={a.name} nameB={b.name}
        subA={a.archetype} subB={b.archetype}
      />
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
        <RadarChart data={radarA} color={colorA} compareData={radarB} compareColor={colorB} size={150} />
      </div>
      <CompareFacetRow label="POWER"    valueA={a.facets.power}    valueB={b.facets.power}    colorA={colorA} colorB={colorB} />
      <CompareFacetRow label="AERO"     valueA={a.facets.aero}     valueB={b.facets.aero}     colorA={colorA} colorB={colorB} />
      <CompareFacetRow label="HANDLING" valueA={a.facets.handling} valueB={b.facets.handling} colorA={colorA} colorB={colorB} />
      <CompareFacetRow label="CREW"     valueA={a.facets.pitCrew}  valueB={b.facets.pitCrew}  colorA={colorA} colorB={colorB} />
    </motion.div>
  )
}

// ─── Mini stat bar row ────────────────────────────────────────────────────────

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ width: 32, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
  )
}

// ─── Main GridStats screen ────────────────────────────────────────────────────

export function GridStats() {
  const exitGrid = useSeasonStore(s => s.exitGrid)
  const uiTap = useUiTap()
  const [tab, setTab] = useState<'drivers' | 'cars'>('drivers')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [compareIds, setCompareIds] = useState<string[]>([])

  function toggle(id: string) {
    setExpanded(prev => prev === id ? null : id)
  }

  function toggleCompareSelection(id: string) {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 2) return [prev[1]!, id] // FIFO swap once 2 are already picked
      return [...prev, id]
    })
  }

  function toggleCompareMode() {
    setCompareMode(v => !v)
    setCompareIds([])
    setExpanded(null)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ ease: 'easeOut', duration: 0.25 }}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-deep)',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 16px 12px',
        borderBottom: '1px solid var(--line-hair)', flexShrink: 0,
      }}>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => { uiTap(); exitGrid() }}
          style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--line-hair)',
            borderRadius: 8, width: 36, height: 36, cursor: 'pointer',
            color: 'var(--text-hi)', fontSize: 18, display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >‹</motion.button>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>
            SEASON 2025
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-hi)', marginTop: 1 }}>
            Grid & Stats
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', padding: '10px 16px',
        borderBottom: '1px solid var(--line-hair)', flexShrink: 0, gap: 8,
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['drivers', 'cars'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setExpanded(null); setCompareIds([]) }}
              style={{
                fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.1em', padding: '7px 18px', borderRadius: 8,
                border: 'none', cursor: 'pointer',
                background: tab === t ? 'var(--accent)' : 'var(--bg-elevated)',
                color: tab === t ? 'var(--bg-deep)' : 'var(--text-mid)',
                transition: 'all 0.15s',
              }}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={() => { uiTap(); toggleCompareMode() }}
          style={{
            fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.06em', padding: '7px 14px', borderRadius: 8,
            border: compareMode ? 'none' : '1px solid var(--line-hair)', cursor: 'pointer',
            background: compareMode ? 'var(--accent-warm)' : 'transparent',
            color: compareMode ? 'var(--bg-deep)' : 'var(--text-mid)',
            transition: 'all 0.15s',
          }}
        >
          {compareMode ? '✕ COMPARE' : '⇄ COMPARE'}
        </button>
      </div>

      {compareMode && (
        <div style={{
          padding: '8px 16px', borderBottom: '1px solid var(--line-hair)', flexShrink: 0,
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.05em',
        }}>
          {compareIds.length < 2
            ? `Tap ${2 - compareIds.length} more ${tab === 'drivers' ? 'driver' : 'team'}${2 - compareIds.length > 1 ? 's' : ''} to compare`
            : 'Tap a row to swap it into the comparison'}
        </div>
      )}

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
        {compareMode && compareIds.length === 2 && tab === 'drivers' && (
          <AnimatePresence>
            <DriverCompareView
              a={drivers.find(d => d.id === compareIds[0])!}
              b={drivers.find(d => d.id === compareIds[1])!}
              onClose={() => setCompareIds([])}
            />
          </AnimatePresence>
        )}
        {compareMode && compareIds.length === 2 && tab === 'cars' && (
          <AnimatePresence>
            <TeamCompareView
              a={teams.find(t => t.id === compareIds[0])!}
              b={teams.find(t => t.id === compareIds[1])!}
              onClose={() => setCompareIds([])}
            />
          </AnimatePresence>
        )}
        <AnimatePresence mode="wait">
          {tab === 'drivers' ? (
            <motion.div key="drivers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {drivers.map((driver, i) => {
                const color = teamColor(driver.teamId)
                const isOpen = expanded === driver.id
                const isSelected = compareIds.includes(driver.id)
                return (
                  <motion.div
                    key={driver.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    style={{ marginBottom: 8 }}
                  >
                    {/* Row */}
                    <button
                      onClick={() => compareMode ? toggleCompareSelection(driver.id) : toggle(driver.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                        padding: '11px 14px',
                        background: isSelected ? `${color}1c` : isOpen ? `${color}14` : 'var(--bg-elevated)',
                        border: `1px solid ${isSelected ? color : isOpen ? color + '66' : 'var(--line-hair)'}`,
                        borderRadius: isOpen && !compareMode ? '12px 12px 0 0' : 12,
                        cursor: 'pointer', outline: 'none', textAlign: 'left',
                        transition: 'all 0.15s',
                      }}
                    >
                      {/* Color stripe */}
                      <div style={{ width: 3, height: 36, borderRadius: 2, background: color, flexShrink: 0 }} />
                      {/* Name block */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
                          color: isOpen ? color : 'var(--text-hi)', letterSpacing: '0.04em',
                        }}>
                          {driver.name.toUpperCase()}
                        </div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                          {teamName(driver.teamId)}
                        </div>
                      </div>
                      {/* Mini sparkline: pace / racecraft / tyreManagement / consistency */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                        <MiniBar value={driver.facets.pace}           color={color} />
                        <MiniBar value={driver.facets.racecraft}      color={color} />
                        <MiniBar value={driver.facets.tyreManagement} color={color} />
                        <MiniBar value={driver.facets.consistency}    color={color} />
                      </div>
                      {/* Overall */}
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700,
                        color: isOpen ? color : 'var(--text-hi)',
                        fontVariantNumeric: 'tabular-nums', minWidth: 32, textAlign: 'right',
                      }}>
                        {Math.round((driver.facets.pace + driver.facets.racecraft + driver.facets.tyreManagement + driver.facets.consistency) / 4)}
                      </div>
                      <div style={{ color: isOpen ? color : 'var(--text-dim)', fontSize: 14 }}>
                        {isOpen ? '▲' : '▼'}
                      </div>
                    </button>
                    {/* Expanded detail */}
                    <AnimatePresence>
                      {isOpen && <DriverCard key="card" driver={driver} />}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </motion.div>
          ) : (
            <motion.div key="cars" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {teams.map((team, i) => {
                const color = team.colorPrimary
                const isOpen = expanded === team.id
                const isSelected = compareIds.includes(team.id)
                const f = team.facets
                return (
                  <motion.div
                    key={team.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    style={{ marginBottom: 8 }}
                  >
                    <button
                      onClick={() => compareMode ? toggleCompareSelection(team.id) : toggle(team.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                        padding: '11px 14px',
                        background: isSelected ? `${color}1c` : isOpen ? `${color}14` : 'var(--bg-elevated)',
                        border: `1px solid ${isSelected ? color : isOpen ? color + '66' : 'var(--line-hair)'}`,
                        borderRadius: isOpen && !compareMode ? '12px 12px 0 0' : 12,
                        cursor: 'pointer', outline: 'none', textAlign: 'left',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ width: 3, height: 36, borderRadius: 2, background: color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
                          color: isOpen ? color : 'var(--text-hi)', letterSpacing: '0.04em',
                        }}>
                          {team.name.toUpperCase()}
                        </div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                          PWR {f.power} · AERO {f.aero} · HDL {f.handling}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                        <MiniBar value={f.power}    color={color} />
                        <MiniBar value={f.aero}     color={color} />
                        <MiniBar value={f.handling} color={color} />
                        <MiniBar value={f.pitCrew}  color={color} />
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700,
                        color: isOpen ? color : 'var(--text-hi)',
                        fontVariantNumeric: 'tabular-nums', minWidth: 32, textAlign: 'right',
                      }}>
                        {Math.round((f.power + f.aero + f.handling) / 3)}
                      </div>
                      <div style={{ color: isOpen ? color : 'var(--text-dim)', fontSize: 14 }}>
                        {isOpen ? '▲' : '▼'}
                      </div>
                    </button>
                    <AnimatePresence>
                      {isOpen && <CarCard key="card" team={team} />}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
