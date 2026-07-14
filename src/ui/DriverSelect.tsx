import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import { useUiTap } from '@hooks/useUiTap'
import { HelmetAvatar, type HelmetPattern } from './HelmetAvatar'
import driversData from '@data/drivers.json'
import carsData from '@data/cars.json'

type DriverFacets = { pace: number; racecraft: number; tyreManagement: number; consistency: number; wetWeather: number; experience: number }
type DriverEntry = { id: string; name: string; code: string; teamId: string; flag?: string; facets: DriverFacets }
type TeamEntry   = { id: string; name: string; colorPrimary: string; colorSecondary?: string }

const allDrivers = driversData.drivers as DriverEntry[]
const allTeams   = (carsData as unknown as { teams: TeamEntry[] }).teams

function teamEntry(teamId: string): TeamEntry {
  return allTeams.find(t => t.id === teamId) ?? { id: teamId, name: teamId, colorPrimary: '#888' }
}

function avgFacets(f: DriverFacets): number {
  const vals = Object.values(f).filter(v => typeof v === 'number') as number[]
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
}

function driverTier(overall: number): { label: string; color: string } {
  if (overall >= 90) return { label: 'ELITE',  color: 'var(--accent)' }
  if (overall >= 80) return { label: 'PRO',    color: 'var(--tyre-medium)' }
  return              { label: 'ROOKIE', color: 'var(--text-dim)' }
}

function driverPattern(driverId: string, teamId: string): HelmetPattern {
  const teamDriverIds = allDrivers.filter(d => d.teamId === teamId).map(d => d.id)
  return teamDriverIds.indexOf(driverId) === 0 ? 'stripe' : 'chevron'
}

function gridNumber(driverId: string): number {
  return allDrivers.findIndex(d => d.id === driverId) + 1
}

const FACET_LABELS: [keyof DriverFacets, string][] = [
  ['pace',           'PCE'],
  ['racecraft',      'RCE'],
  ['tyreManagement', 'TYR'],
  ['consistency',    'CON'],
]

export function DriverSelect() {
  const selectedTeamId = useSeasonStore(s => s.selectedTeamId)
  const playerDriverId = useSeasonStore(s => s.playerDriverId)
  const selectDriver   = useSeasonStore(s => s.selectDriver)
  const confirmDriver  = useSeasonStore(s => s.confirmDriver)
  const backToTeamSelect = useSeasonStore(s => s.backToTeamSelect)
  const uiTap = useUiTap()

  const team    = selectedTeamId ? teamEntry(selectedTeamId) : null
  const drivers = allDrivers.filter(d => d.teamId === selectedTeamId)

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-deep)',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {/* Header */}
      <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid var(--line-hair)', flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>
            NEW SEASON · STEP 2 OF 2
          </div>
          {team && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: team.colorPrimary,
              padding: '2px 7px', borderRadius: 4, border: `1px solid ${team.colorPrimary}66`,
              background: `${team.colorPrimary}12`, letterSpacing: '0.06em',
            }}>
              {team.name.toUpperCase()}
            </div>
          )}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)' }}>
          Field a Driver
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
          Pick which driver you'll race this round.
        </div>
        </div>
        <motion.button whileTap={{ scale: 0.94 }} onClick={() => { uiTap(); backToTeamSelect() }}
          style={{ flexShrink: 0, background: 'var(--bg-elevated)', border: '1px solid var(--line-hair)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)', letterSpacing: '0.08em' }}>
          ← BACK
        </motion.button>
      </div>

      {/* Driver cards — only this team's 2 drivers */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {drivers.map((driver, i) => {
          const selected   = playerDriverId === driver.id
          const overall    = avgFacets(driver.facets)
          const tier       = driverTier(overall)
          const pattern    = driverPattern(driver.id, driver.teamId)
          const teamColor  = team?.colorPrimary ?? '#888'
          const teamSec    = team?.colorSecondary

          return (
            <motion.button
              key={driver.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => selectDriver(driver.id)}
              style={{
                border: selected ? `1.5px solid ${teamColor}` : '1px solid var(--line-hair)',
                borderRadius: 16, padding: '16px 14px',
                background: selected
                  ? `linear-gradient(135deg, ${teamColor}18 0%, var(--bg-elevated) 100%)`
                  : 'var(--bg-elevated)',
                cursor: 'pointer', outline: 'none', textAlign: 'left',
                boxShadow: selected ? `0 3px 24px ${teamColor}30` : 'none',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <HelmetAvatar
                  teamPrimary={teamColor}
                  teamSecondary={teamSec}
                  pattern={pattern}
                  number={gridNumber(driver.id)}
                  size={64}
                  selected={selected}
                  selectionColor={teamColor}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Flag + name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    {driver.flag && <span style={{ fontSize: 16 }}>{driver.flag}</span>}
                    <span style={{
                      fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700,
                      color: selected ? teamColor : 'var(--text-hi)', letterSpacing: '0.03em',
                    }}>
                      {driver.name}
                    </span>
                  </div>

                  {/* Tier + overall */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
                      color: tier.color, padding: '2px 7px', borderRadius: 4,
                      border: `1px solid ${tier.color}66`, background: `${tier.color}10`,
                    }}>
                      {tier.label}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>
                      {overall} OVR
                    </span>
                  </div>

                  {/* Facet mini-bars */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {FACET_LABELS.map(([key, label]) => {
                      const val = driver.facets[key]
                      return (
                        <div key={key} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>{label}</span>
                          <div style={{ height: 3, borderRadius: 1.5, background: 'var(--line-hair)', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 1.5, width: `${val}%`,
                              background: selected ? teamColor : 'var(--text-mid)',
                              transition: 'background 0.2s',
                            }} />
                          </div>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </motion.button>
          )
        })}

        {drivers.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', fontFamily: 'var(--font-body)', color: 'var(--text-dim)' }}>
            No drivers found. Go back and select a team.
          </div>
        )}
      </div>

      {/* CTA */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line-hair)', flexShrink: 0 }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => { uiTap(); confirmDriver() }}
          disabled={!playerDriverId}
          style={{
            width: '100%', border: 'none', borderRadius: 10, padding: '16px',
            background: playerDriverId ? 'var(--accent)' : 'var(--bg-elevated)',
            color: playerDriverId ? 'var(--bg-deep)' : 'var(--text-dim)',
            fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700,
            letterSpacing: '0.08em', cursor: playerDriverId ? 'pointer' : 'default',
            outline: playerDriverId ? 'none' : '1px solid var(--line-hair)',
            transition: 'all 0.2s',
          }}
        >
          {playerDriverId
            ? `RACE WITH ${allDrivers.find(d => d.id === playerDriverId)?.code ?? '...'} →`
            : 'SELECT A DRIVER'}
        </motion.button>
      </div>
    </motion.div>
  )
}
