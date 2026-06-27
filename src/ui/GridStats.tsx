import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import driversData from '@data/drivers.json'
import carsData from '@data/cars.json'

// ─── Types ────────────────────────────────────────────────────────────────────

type DriverFacets = {
  pace: number; racecraft: number; tyreManagement: number
  consistency: number; wetWeather: number; experience: number
}
type TeamFacets = {
  power: number; aero: number; handling: number; reliability: number; pitCrew: number
}
type Driver = { id: string; name: string; code: string; teamId: string; facets: DriverFacets; potential?: number; age?: number }
type Team   = { id: string; name: string; colorPrimary: string; colorSecondary: string; facets: TeamFacets }

const drivers = driversData.drivers as Driver[]
const teams   = carsData.teams as Team[]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEAM_COLORS: Record<string, string> = {
  apex: '#00E5D0', meridian: '#FF4D5E', vortex: '#F2C94C', zenith: '#7B5EA7', torque: '#FF7A00',
}

function teamColor(teamId: string) { return TEAM_COLORS[teamId] ?? '#888' }
function teamName(teamId: string)  { return teams.find(t => t.id === teamId)?.name ?? teamId }

// ─── Radar polygon ────────────────────────────────────────────────────────────

type RadarDatum = { label: string; value: number; dormant?: boolean }

function RadarChart({ data, color, size = 140 }: { data: RadarDatum[]; color: string; size?: number }) {
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
  const [tab, setTab] = useState<'drivers' | 'cars'>('drivers')
  const [expanded, setExpanded] = useState<string | null>(null)

  function toggle(id: string) {
    setExpanded(prev => prev === id ? null : id)
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
          onClick={exitGrid}
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
      }}>
        {(['drivers', 'cars'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setExpanded(null) }}
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

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
        <AnimatePresence mode="wait">
          {tab === 'drivers' ? (
            <motion.div key="drivers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {drivers.map((driver, i) => {
                const color = teamColor(driver.teamId)
                const isOpen = expanded === driver.id
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
                      onClick={() => toggle(driver.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                        padding: '11px 14px',
                        background: isOpen ? `${color}14` : 'var(--bg-elevated)',
                        border: `1px solid ${isOpen ? color + '66' : 'var(--line-hair)'}`,
                        borderRadius: isOpen ? '12px 12px 0 0' : 12,
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
                      onClick={() => toggle(team.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                        padding: '11px 14px',
                        background: isOpen ? `${color}14` : 'var(--bg-elevated)',
                        border: `1px solid ${isOpen ? color + '66' : 'var(--line-hair)'}`,
                        borderRadius: isOpen ? '12px 12px 0 0' : 12,
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
