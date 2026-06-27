import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import driversData from '@data/drivers.json'
import carsData from '@data/cars.json'

const TEAM_COLORS: Record<string, string> = {
  apex:     'var(--accent)',
  meridian: 'var(--accent-warm)',
  vortex:   'var(--tyre-medium)',
  zenith:   '#7B5EA7',
  torque:   '#FF7A00',
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

      {/* Driver grid */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px 12px',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
        alignContent: 'start',
      }}>
        {drivers.map(driver => {
          const selected = playerDriverId === driver.id
          const color = TEAM_COLORS[driver.teamId] ?? 'var(--text-mid)'
          return (
            <motion.button
              key={driver.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => selectDriver(driver.id)}
              style={{
                border: selected ? `2px solid ${color}` : '2px solid var(--line-hair)',
                borderRadius: 10,
                padding: '14px 12px',
                background: selected ? 'var(--bg-elevated)' : 'var(--bg-elevated)',
                cursor: 'pointer', textAlign: 'left',
                boxShadow: selected ? `0 0 16px ${color}44` : 'none',
                outline: 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
                color: selected ? color : 'var(--text-hi)', letterSpacing: '0.04em',
              }}>
                {driver.name.toUpperCase()}
              </div>
              <div style={{
                fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', marginTop: 3,
              }}>
                {teamName(driver.teamId)}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10,
                color: selected ? color : 'var(--text-dim)',
                marginTop: 4, letterSpacing: '0.08em',
              }}>
                {skillLabel(driver.skill)}
              </div>
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
