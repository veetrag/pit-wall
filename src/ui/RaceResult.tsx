import { motion } from 'framer-motion'
import { useSeasonStore, TOTAL_RACES } from '@state/seasonStore'
import driversData from '@data/drivers.json'

type DriverEntry = { id: string; name: string; teamId: string }
const drivers = driversData.drivers as DriverEntry[]

function driverName(id: string): string {
  return drivers.find(d => d.id === id)?.name ?? id.replace('d_', '').toUpperCase()
}

function positionLabel(pos: number): string {
  if (pos === 1) return '1ST'
  if (pos === 2) return '2ND'
  if (pos === 3) return '3RD'
  return `${pos}TH`
}

const MEDAL_COLORS = ['var(--tyre-medium)', 'var(--text-mid)', '#CD7F32']

export function RaceResult() {
  const { lastRaceResults, standings, playerDriverId, raceIndex, nextRace } = useSeasonStore()

  const playerResult = lastRaceResults?.find(r => r.driverId === playerDriverId)
  const podium = (lastRaceResults ?? []).filter(r => r.position <= 3).sort((a, b) => a.position - b.position)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-deep)',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {/* Header */}
      <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--line-hair)', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>
          RACE {raceIndex + 1} OF {TOTAL_RACES} · SILVERPARK
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>
          Race Result
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* Player result card */}
        {playerResult && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: 'var(--bg-elevated)', borderRadius: 12,
              border: '1px solid var(--accent)',
              padding: '16px 20px', marginBottom: 16,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--accent)', letterSpacing: '0.15em' }}>
                YOUR RESULT
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 800, color: 'var(--text-hi)', lineHeight: 1.1 }}>
                {positionLabel(playerResult.position)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
                POINTS
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 800, color: playerResult.points > 0 ? 'var(--positive)' : 'var(--text-dim)' }}>
                +{playerResult.points}
              </div>
            </div>
          </motion.div>
        )}

        {/* Podium */}
        {podium.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 8 }}>
              PODIUM
            </div>
            {podium.map((r, i) => (
              <motion.div
                key={r.driverId}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderRadius: 8,
                  background: r.driverId === playerDriverId ? 'rgba(0,229,208,0.08)' : 'var(--bg-elevated)',
                  border: r.driverId === playerDriverId ? '1px solid var(--accent)' : '1px solid var(--line-hair)',
                  marginBottom: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: MEDAL_COLORS[i] ?? 'var(--text-dim)', width: 24 }}>
                    P{r.position}
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: r.driverId === playerDriverId ? 'var(--accent)' : 'var(--text-hi)' }}>
                    {driverName(r.driverId).toUpperCase()}
                  </span>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--positive)', fontVariantNumeric: 'tabular-nums' }}>
                  +{r.points}
                </span>
              </motion.div>
            ))}
          </div>
        )}

        {/* Championship standings */}
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 8 }}>
            CHAMPIONSHIP STANDINGS
          </div>
          {standings.slice(0, 6).map((s, i) => (
            <div
              key={s.driverId}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 14px', borderRadius: 6,
                background: s.driverId === playerDriverId ? 'rgba(0,229,208,0.06)' : 'transparent',
                borderLeft: s.driverId === playerDriverId ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: 3,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', width: 20 }}>
                  {i + 1}
                </span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: s.driverId === playerDriverId ? 'var(--accent)' : 'var(--text-hi)' }}>
                  {driverName(s.driverId).toUpperCase()}
                </span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-hi)', fontVariantNumeric: 'tabular-nums' }}>
                {s.points} PTS
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Continue button */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line-hair)', flexShrink: 0 }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={nextRace}
          style={{
            width: '100%', border: 'none', borderRadius: 10, padding: '16px',
            background: 'var(--accent)', color: 'var(--bg-deep)',
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
            letterSpacing: '0.08em', cursor: 'pointer',
          }}
        >
          {raceIndex < TOTAL_RACES - 1 ? `RACE ${raceIndex + 2} →` : 'FINAL STANDINGS →'}
        </motion.button>
      </div>
    </motion.div>
  )
}
