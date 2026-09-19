import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'
import { useSettingsStore } from '@state/settingsStore'
import { useUiTap } from '@hooks/useUiTap'
import driversData from '@data/drivers.json'
import carsData from '@data/cars.json'

type DriverEntry = { id: string; name: string; teamId: string }
type TeamEntry = { id: string; name: string }
const drivers = driversData.drivers as DriverEntry[]
const teams = carsData.teams as TeamEntry[]

function driverName(id: string): string {
  return drivers.find(d => d.id === id)?.name ?? id.replace('d_', '').toUpperCase()
}
function teamName(id: string): string {
  return teams.find(t => t.id === id)?.name ?? id.toUpperCase()
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', borderRadius: 10,
      border: '1px solid var(--line-hair)', padding: '12px 10px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 10, color: 'var(--text-dim)',
        letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700,
        color: 'var(--text-hi)', fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
    </div>
  )
}

export function CareerRecord() {
  const exitCareer = useSeasonStore(s => s.exitCareer)
  const {
    seasonNumber, titles, wins, podiums, poles, racesStarted, bestFinish, seasonHistory,
  } = useCareerStore()
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const uiTap = useUiTap()

  const completedSeasons = seasonNumber - 1

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reducedMotion ? undefined : { opacity: 0 }}
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
          whileTap={reducedMotion ? undefined : { scale: 0.92 }}
          onClick={() => { uiTap(); exitCareer() }}
          style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--line-hair)',
            borderRadius: 8, width: 36, height: 36, cursor: 'pointer',
            color: 'var(--text-hi)', fontSize: 18, display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >‹</motion.button>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>
            SEASON {seasonNumber}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-hi)', marginTop: 1 }}>
            Career Record
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* Headline stats */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20,
        }}>
          <StatTile label="Seasons" value={completedSeasons} />
          <StatTile label="Titles" value={titles} />
          <StatTile label="Wins" value={wins} />
          <StatTile label="Podiums" value={podiums} />
          <StatTile label="Poles" value={poles} />
          <StatTile label="Races Started" value={racesStarted} />
          <StatTile label="Best Finish" value={bestFinish === null ? '—' : `P${bestFinish}`} />
        </div>

        {/* Season history */}
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 8 }}>
          SEASON HISTORY
        </div>

        {seasonHistory.length === 0 ? (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: 'var(--bg-elevated)', borderRadius: 12,
              border: '1px dashed var(--line-hair)', padding: '28px 20px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--text-hi)', marginBottom: 6 }}>
              THE RECORD STARTS AT THE CHEQUERED FLAG
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.5 }}>
              Finish your first season and it lands here — every result, every title, for as long as you keep racing.
            </div>
          </motion.div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Natural-height list: no fixed max-height, no overflow:hidden here.
                The scrolling parent above is what scrolls; this list is never
                sliced, so an endless career's full history always renders. */}
            {seasonHistory.map((s, i) => {
              const champion = s.championshipPosition === 1
              return (
                <motion.div
                  key={s.seasonNumber}
                  data-testid="career-season-row"
                  initial={reducedMotion ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={reducedMotion ? undefined : { delay: 0.03 * i }}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 14px', borderRadius: 10,
                    background: champion
                      ? 'linear-gradient(rgba(242,201,76,0.08), rgba(242,201,76,0.08)), var(--bg-elevated)'
                      : 'var(--bg-elevated)',
                    border: `1px solid ${champion ? 'var(--tyre-medium)' : 'var(--line-hair)'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)',
                      width: 28, fontVariantNumeric: 'tabular-nums',
                    }}>
                      S{s.seasonNumber}
                    </span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600,
                          color: champion ? 'var(--tyre-medium)' : 'var(--text-hi)',
                        }}>
                          P{s.championshipPosition}
                        </span>
                        {champion && (
                          <span style={{
                            fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700,
                            color: 'var(--bg-deep)', background: 'var(--tyre-medium)',
                            borderRadius: 4, padding: '2px 6px', letterSpacing: '0.08em',
                          }}>
                            CHAMPION
                          </span>
                        )}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                        {driverName(s.driverId)} · {teamName(s.teamId)}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-hi)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {s.points} PTS
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {s.wins} {s.wins === 1 ? 'WIN' : 'WINS'}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}
