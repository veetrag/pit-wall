import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import carsData from '@data/cars.json'
import driversData from '@data/drivers.json'

type TeamFacets = { power: number; aero: number; handling: number; pitCrew: number; reliability: number }
type TeamEntry = {
  id: string; name: string; flag?: string; nationality?: string;
  colorPrimary: string; colorSecondary?: string;
  facets: TeamFacets; archetype?: string
}
type DriverEntry = { id: string; code: string; teamId: string; flag?: string }

const allTeams = (carsData as unknown as { teams: TeamEntry[] }).teams
const allDrivers = driversData.drivers as DriverEntry[]

function carRating(facets: TeamFacets): number {
  const vals = Object.values(facets).filter(v => typeof v === 'number') as number[]
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
}

function teamTier(rating: number): { label: string; color: string } {
  if (rating >= 88) return { label: 'FRONT-RUNNER', color: 'var(--accent)' }
  if (rating >= 80) return { label: 'MIDFIELD', color: 'var(--tyre-medium)' }
  return { label: 'BACKMARKER', color: 'var(--text-dim)' }
}

function teamDrivers(teamId: string): DriverEntry[] {
  return allDrivers.filter(d => d.teamId === teamId).slice(0, 2)
}

export function TeamSelect() {
  const selectedTeamId = useSeasonStore(s => s.selectedTeamId)
  const selectTeam = useSeasonStore(s => s.selectTeam)
  const confirmTeam = useSeasonStore(s => s.confirmTeam)

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
      <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid var(--line-hair)', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>
          QUICK RACE · STEP 1 OF 2
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>
          Choose Your Team
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
          Your team's car, pit crew, and both drivers are yours to manage.
        </div>
      </div>

      {/* Team list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {allTeams.map((team, i) => {
          const rating = carRating(team.facets)
          const tier = teamTier(rating)
          const drivers = teamDrivers(team.id)
          const selected = selectedTeamId === team.id

          return (
            <motion.button
              key={team.id}
              initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => selectTeam(team.id)}
              style={{
                border: selected ? `1px solid ${team.colorPrimary}` : '1px solid var(--line-hair)',
                borderRadius: 14, padding: '12px 14px',
                background: selected
                  ? `linear-gradient(135deg, ${team.colorPrimary}14 0%, var(--bg-elevated) 100%)`
                  : 'var(--bg-elevated)',
                cursor: 'pointer', outline: 'none', textAlign: 'left',
                boxShadow: selected ? `0 2px 20px ${team.colorPrimary}28` : 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Livery swatch */}
                <div style={{
                  width: 6, alignSelf: 'stretch', borderRadius: 3,
                  background: `linear-gradient(180deg, ${team.colorPrimary} 0%, ${team.colorSecondary ?? '#0A0E1A'} 100%)`,
                  flexShrink: 0,
                }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Top row: flag + name + rating */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {team.flag && <span style={{ fontSize: 16 }}>{team.flag}</span>}
                      <span style={{
                        fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
                        color: selected ? team.colorPrimary : 'var(--text-hi)', letterSpacing: '0.03em',
                      }}>
                        {team.name}
                      </span>
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700,
                      color: selected ? team.colorPrimary : 'var(--text-mid)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {rating}
                    </span>
                  </div>

                  {/* Tier + archetype */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
                      color: tier.color, padding: '2px 6px', borderRadius: 4,
                      border: `1px solid ${tier.color}66`, background: `${tier.color}0F`,
                    }}>
                      {tier.label}
                    </span>
                    {team.archetype && (
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-dim)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {team.archetype}
                      </span>
                    )}
                  </div>

                  {/* Driver codes */}
                  {drivers.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      {drivers.map(d => (
                        <span key={d.id} style={{
                          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)',
                          background: 'var(--bg-panel)', borderRadius: 4, padding: '2px 6px',
                          border: '1px solid var(--line-hair)',
                        }}>
                          {d.flag} {d.code}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {selected && (
                  <motion.span
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    style={{ color: team.colorPrimary, fontSize: 20, flexShrink: 0 }}
                  >›</motion.span>
                )}
              </div>
            </motion.button>
          )
        })}
      </div>

      {/* CTA */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line-hair)', flexShrink: 0 }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={confirmTeam}
          disabled={!selectedTeamId}
          style={{
            width: '100%', border: 'none', borderRadius: 10, padding: '16px',
            background: selectedTeamId ? 'var(--accent)' : 'var(--bg-elevated)',
            color: selectedTeamId ? 'var(--bg-deep)' : 'var(--text-dim)',
            fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700,
            letterSpacing: '0.08em', cursor: selectedTeamId ? 'pointer' : 'default',
            outline: selectedTeamId ? 'none' : '1px solid var(--line-hair)',
            transition: 'all 0.2s',
          }}
        >
          {selectedTeamId ? 'FIELD THIS TEAM →' : 'SELECT A TEAM'}
        </motion.button>
      </div>
    </motion.div>
  )
}
