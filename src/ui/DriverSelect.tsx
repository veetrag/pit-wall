import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import driversData from '@data/drivers.json'
import carsData from '@data/cars.json'

const TEAM_COLORS: Record<string, string> = {
  apex:     '#00E5D0',
  meridian: '#FF4D5E',
  vortex:   '#F2C94C',
  zenith:   '#7B5EA7',
  torque:   '#FF7A00',
}

// Unique helmet color combos per driver (bg gradient stops, visor color)
const DRIVER_HELMET: Record<string, { from: string; to: string; visor: string; number: number }> = {
  d_ver: { from: '#001a6e', to: '#0052cc', visor: '#00cfff', number: 1  },
  d_nor: { from: '#cc2200', to: '#ff6b3d', visor: '#ffe066', number: 4  },
  d_ham: { from: '#222222', to: '#555555', visor: '#00E5D0', number: 44 },
  d_lec: { from: '#a30000', to: '#e00000', visor: '#ffffff', number: 16 },
  d_rus: { from: '#00509e', to: '#003d7a', visor: '#ffd700', number: 63 },
  d_alo: { from: '#004a99', to: '#0074e8', visor: '#00ff9d', number: 14 },
  d_sai: { from: '#c70000', to: '#ff3333', visor: '#ffcc00', number: 55 },
  d_pia: { from: '#ff5500', to: '#cc3d00', visor: '#00ccff', number: 81 },
  d_oco: { from: '#0090d4', to: '#005a8a', visor: '#ff9500', number: 31 },
  d_gas: { from: '#1e1e2e', to: '#3a3a5c', visor: '#ff4d5e', number: 10 },
}

type DriverEntry = { id: string; name: string; teamId: string; skill: number }
type TeamEntry = { id: string; name: string; rating: number }

const drivers = driversData.drivers as DriverEntry[]
const teams = carsData.teams as TeamEntry[]

function teamName(teamId: string): string {
  return teams.find(t => t.id === teamId)?.name ?? teamId
}

function skillLabel(skill: number): string {
  if (skill <= 2) return 'ELITE'
  if (skill <= 4) return 'PRO'
  return 'RESERVE'
}

function skillColor(skill: number): string {
  if (skill <= 2) return 'var(--accent)'
  if (skill <= 4) return 'var(--tyre-medium)'
  return 'var(--text-dim)'
}

function DriverPhoto({ driverId, teamId, selected }: { driverId: string; teamId: string; selected: boolean }) {
  const helmet = DRIVER_HELMET[driverId]
  const teamColor = TEAM_COLORS[teamId] ?? '#888'
  const h = helmet ?? { from: '#333', to: '#555', visor: '#aaa', number: 0 }

  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      style={{
        flexShrink: 0,
        filter: selected ? `drop-shadow(0 0 8px ${teamColor}88)` : 'none',
        transition: 'filter 0.2s ease',
      }}
    >
      <defs>
        <radialGradient id={`hg_${driverId}`} cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor={h.from} />
          <stop offset="100%" stopColor={h.to} />
        </radialGradient>
        <clipPath id={`hc_${driverId}`}>
          <ellipse cx="28" cy="28" rx="26" ry="26" />
        </clipPath>
      </defs>

      {/* Base helmet shape */}
      <ellipse cx="28" cy="28" rx="26" ry="26" fill={`url(#hg_${driverId})`} />

      {/* Helmet dome highlight */}
      <ellipse cx="22" cy="18" rx="10" ry="7" fill="rgba(255,255,255,0.12)" />

      {/* Visor */}
      <rect x="9" y="26" width="38" height="14" rx="5" fill={h.visor} opacity="0.9"
        clipPath={`url(#hc_${driverId})`} />
      <rect x="9" y="26" width="38" height="14" rx="5" fill="rgba(0,0,0,0.35)"
        clipPath={`url(#hc_${driverId})`} />

      {/* Visor tint overlay (left edge darker) */}
      <rect x="9" y="26" width="12" height="14" fill="rgba(0,0,0,0.25)"
        clipPath={`url(#hc_${driverId})`} />

      {/* Chin */}
      <ellipse cx="28" cy="50" rx="18" ry="8" fill={h.to} clipPath={`url(#hc_${driverId})`} />

      {/* Race number */}
      <text
        x="28"
        y="23"
        textAnchor="middle"
        fontFamily="monospace"
        fontWeight="bold"
        fontSize={h.number > 9 ? '10' : '12'}
        fill="rgba(255,255,255,0.85)"
        letterSpacing="-0.5"
      >
        {h.number}
      </text>

      {/* Team color stripe on top */}
      <rect x="20" y="3" width="16" height="4" rx="2" fill={teamColor} opacity="0.9" />

      {/* Selection ring */}
      {selected && (
        <ellipse cx="28" cy="28" rx="26" ry="26" fill="none"
          stroke={teamColor} strokeWidth="2.5" />
      )}
    </svg>
  )
}

export function DriverSelect() {
  const playerDriverId = useSeasonStore(s => s.playerDriverId)
  const selectDriver = useSeasonStore(s => s.selectDriver)
  const confirmDriver = useSeasonStore(s => s.confirmDriver)

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-deep)',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '20px 20px 16px',
        borderBottom: '1px solid var(--line-hair)',
        flexShrink: 0,
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>
          SEASON 2025
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>
          Choose Your Driver
        </div>
      </div>

      {/* Driver list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {drivers.map((driver, i) => {
          const selected = playerDriverId === driver.id
          const color = TEAM_COLORS[driver.teamId] ?? 'var(--text-mid)'
          return (
            <motion.button
              key={driver.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, ease: 'easeOut' }}
              whileTap={{ scale: 0.98 }}
              onClick={() => selectDriver(driver.id)}
              style={{
                border: selected ? `1px solid ${color}` : '1px solid var(--line-hair)',
                borderRadius: 14,
                padding: '10px 14px 10px 10px',
                background: selected
                  ? `linear-gradient(135deg, ${color}14 0%, var(--bg-elevated) 100%)`
                  : 'var(--bg-elevated)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 14,
                outline: 'none',
                boxShadow: selected ? `0 2px 24px ${color}28` : 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
              }}
            >
              <DriverPhoto driverId={driver.id} teamId={driver.teamId} selected={selected} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
                  color: selected ? color : 'var(--text-hi)', letterSpacing: '0.04em',
                  lineHeight: 1.1,
                }}>
                  {driver.name.toUpperCase()}
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', marginTop: 3,
                }}>
                  {teamName(driver.teamId)}
                </div>
              </div>

              {/* Skill badge */}
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
                padding: '4px 8px', borderRadius: 6,
                color: selected ? color : skillColor(driver.skill),
                border: `1px solid ${selected ? color : skillColor(driver.skill)}`,
                background: selected ? `${color}18` : 'transparent',
                flexShrink: 0,
              }}>
                {skillLabel(driver.skill)}
              </div>

              {/* Selected chevron */}
              {selected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  style={{ color, fontSize: 18, flexShrink: 0, marginLeft: -6 }}
                >
                  ›
                </motion.div>
              )}
            </motion.button>
          )
        })}
      </div>

      {/* Confirm button */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line-hair)', flexShrink: 0 }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={confirmDriver}
          disabled={!playerDriverId}
          style={{
            width: '100%', border: 'none', borderRadius: 10, padding: '16px',
            background: playerDriverId ? 'var(--accent)' : 'var(--bg-elevated)',
            color: playerDriverId ? 'var(--bg-deep)' : 'var(--text-dim)',
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
            letterSpacing: '0.08em', cursor: playerDriverId ? 'pointer' : 'default',
            outline: playerDriverId ? 'none' : '1px solid var(--line-hair)',
            transition: 'all 0.2s',
          }}
        >
          {playerDriverId ? 'GO RACING →' : 'SELECT A DRIVER'}
        </motion.button>
      </div>
    </motion.div>
  )
}
