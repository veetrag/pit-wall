import { motion } from 'framer-motion'
import { useSettingsStore } from '@state/settingsStore'
import { useSeasonStore, TOTAL_RACES, raceHeadline } from '@state/seasonStore'
import { useUiTap } from '@hooks/useUiTap'
import driversData from '@data/drivers.json'
import carsData from '@data/cars.json'

// See the note in TelemetryZone.tsx: a two-branch ternary here reported every
// crash as "a puncture". Keyed so a new retiredCause fails to compile.
const RETIREMENT_HEADLINE: Record<'tyre' | 'mechanical' | 'crash', string> = {
  tyre: 'Retired — a puncture ended the race early.',
  mechanical: 'Retired — a mechanical failure ended the race early.',
  crash: 'Retired — a crash ended the race early.',
}

type DriverEntry = { id: string; name: string; code: string; teamId: string; flag?: string }
type TeamEntry   = { id: string; name: string; colorPrimary: string }
const allDrivers = driversData.drivers as DriverEntry[]
const allTeams   = (carsData as unknown as { teams: TeamEntry[] }).teams

function driverEntry(id: string): DriverEntry {
  return allDrivers.find(d => d.id === id) ?? { id, name: id, code: id.slice(0, 3).toUpperCase(), teamId: '' }
}
function teamColor(teamId: string): string {
  return allTeams.find(t => t.id === teamId)?.colorPrimary ?? '#888'
}

function Confetti() {
  /*
   * The STORE, not matchMedia directly.
   *
   * Reading the media query here meant the in-app reduced-motion toggle did
   * NOT suppress the confetti -- two dozen simultaneously animating elements,
   * the heaviest motion moment in the game, ignoring the one setting a player
   * would reach for to stop it.
   *
   * The store now carries the OS preference as its default, so this is a
   * superset of the old behaviour rather than a replacement for it.
   */
  const reduced = useSettingsStore(s => s.reducedMotion)
  if (reduced) return null
  const COLORS = ['#00E5D0', '#FF4D5E', '#F2C94C', '#3DDC84', '#EAEAEA']
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 1 }}>
      {Array.from({ length: 24 }, (_, i) => (
        <motion.div
          key={i}
          initial={{ y: -12, x: `${8 + (i / 24) * 84}%`, opacity: 1 }}
          animate={{ y: '105vh', opacity: [1, 1, 0] }}
          transition={{ duration: 1.4 + (i % 5) * 0.15, delay: i * 0.045, ease: 'easeIn' }}
          style={{
            position: 'absolute', top: 0, width: 7, height: 7,
            borderRadius: 1, background: COLORS[i % COLORS.length],
          }}
        />
      ))}
    </div>
  )
}

export function RaceResult() {
  const { lastRaceResults, lastRaceEvents, standings, playerDriverId, raceIndex, nextRace, playAgain, retryRace } = useSeasonStore()
  const uiTap = useUiTap()

  const playerResult = lastRaceResults?.find(r => r.driverId === playerDriverId)
  const sorted = [...(lastRaceResults ?? [])].sort((a, b) => a.position - b.position)
  const podium = sorted.filter(r => r.position <= 3 && !r.retired)
  const isTopThree = !playerResult?.retired && (playerResult?.position ?? 99) <= 3
  const headline = playerResult && lastRaceEvents
    ? (playerResult.retired
        ? RETIREMENT_HEADLINE[playerResult.retiredCause ?? 'tyre']
        : raceHeadline(playerResult.position, lastRaceEvents))
    : null
  const isSeasonEnd = raceIndex >= TOTAL_RACES - 1

  // Key moments
  const moments: { icon: string; text: string }[] = []
  if (lastRaceEvents) {
    if (lastRaceEvents.overtakesGained > 0)
      moments.push({ icon: '⚡', text: `${lastRaceEvents.overtakesGained} overtake${lastRaceEvents.overtakesGained > 1 ? 's' : ''}` })
    if (lastRaceEvents.pitsDone > 0)
      moments.push({ icon: '🔧', text: `${lastRaceEvents.pitsDone} pit stop${lastRaceEvents.pitsDone > 1 ? 's' : ''}` })
    if (lastRaceEvents.hadRain)
      moments.push({ icon: '🌧', text: 'Wet conditions' })
    if (playerResult && playerResult.points > 0)
      moments.push({ icon: '✦', text: `+${playerResult.points} pts` })
  }

  const medalColors = ['var(--tyre-medium)', 'var(--text-mid)', '#CD7F32']

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-deep)',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {isTopThree && <Confetti />}

      {/* Header */}
      <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--line-hair)', flexShrink: 0, position: 'relative', zIndex: 2 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>
          RACE {raceIndex + 1} OF {TOTAL_RACES}
        </div>
        {headline
          ? <div style={{ fontFamily: 'var(--font-body)', fontSize: 18, fontWeight: 600, color: 'var(--text-hi)', marginTop: 4, lineHeight: 1.3 }}>{headline}</div>
          : <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>Race Result</div>
        }
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14, position: 'relative', zIndex: 2 }}>

        {/* Podium */}
        {podium.length === 3 && (
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 10 }}>PODIUM</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
              {([1, 0, 2] as const).map(idx => {
                const r = podium[idx]
                if (!r) return null
                const d = driverEntry(r.driverId)
                const color = teamColor(d.teamId)
                const medal = medalColors[r.position - 1] ?? 'var(--text-dim)'
                const heights = [100, 78, 62]
                const h = heights[r.position - 1] ?? 60
                return (
                  <motion.div
                    key={r.driverId}
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + r.position * 0.1 }}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                  >
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color, marginBottom: 4, textAlign: 'center' }}>
                      {d.flag && <span style={{ marginRight: 2 }}>{d.flag}</span>}{d.code}
                    </div>
                    <div style={{
                      height: h, width: '100%', borderRadius: '6px 6px 0 0',
                      background: `linear-gradient(180deg, ${color}22 0%, transparent 100%)`,
                      border: `1px solid ${color}44`, borderBottom: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color: medal }}>{r.position}</span>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )}

        {/* Key moments */}
        {moments.length > 0 && (
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 8 }}>KEY MOMENTS</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {moments.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.07 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
                    background: 'var(--bg-elevated)', borderRadius: 8, padding: '7px 11px',
                    border: '1px solid var(--line-hair)',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{m.icon}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mid)', whiteSpace: 'nowrap' }}>{m.text}</span>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Full classification */}
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 8 }}>CLASSIFICATION</div>
          <div style={{ background: 'var(--bg-panel)', borderRadius: 10, border: '1px solid var(--line-hair)', overflow: 'hidden' }}>
            {sorted.map((r, i) => {
              const d = driverEntry(r.driverId)
              const color = teamColor(d.teamId)
              const isPlayer = r.driverId === playerDriverId
              return (
                <motion.div
                  key={r.driverId}
                  initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}
                  style={{
                    display: 'grid', gridTemplateColumns: '26px 1fr 36px',
                    alignItems: 'center', gap: 8, padding: '8px 12px',
                    background: isPlayer ? 'rgba(0,229,208,0.06)' : 'transparent',
                    borderLeft: isPlayer ? '2px solid var(--accent)' : '2px solid transparent',
                    borderBottom: i < sorted.length - 1 ? '0.5px solid var(--line-hair)' : 'none',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: r.retired ? 'var(--accent-warm)' : 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>
                    {r.retired ? 'DNF' : r.position}
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: isPlayer ? 'var(--accent)' : 'var(--text-hi)', opacity: r.retired ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                    {d.flag && <span style={{ fontSize: 10 }}>{d.flag}</span>}
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                    {d.code}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: r.points > 0 ? 'var(--positive)' : 'var(--text-dim)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    +{r.points}
                  </span>
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* Championship preview */}
        {standings.length > 0 && (
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 8 }}>CHAMPIONSHIP</div>
            <div style={{ background: 'var(--bg-panel)', borderRadius: 10, border: '1px solid var(--line-hair)', overflow: 'hidden' }}>
              {standings.slice(0, 5).map((s, i) => {
                const d = driverEntry(s.driverId)
                const isPlayer = s.driverId === playerDriverId
                return (
                  <div
                    key={s.driverId}
                    style={{
                      display: 'grid', gridTemplateColumns: '26px 1fr 44px',
                      alignItems: 'center', gap: 8, padding: '7px 12px',
                      background: isPlayer ? 'rgba(0,229,208,0.06)' : 'transparent',
                      borderLeft: isPlayer ? '2px solid var(--accent)' : '2px solid transparent',
                      borderBottom: i < 4 ? '0.5px solid var(--line-hair)' : 'none',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{i + 1}</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, color: isPlayer ? 'var(--accent)' : 'var(--text-hi)' }}>
                      {d.flag && <span style={{ marginRight: 3, fontSize: 9 }}>{d.flag}</span>}{d.code}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-hi)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.points}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => { uiTap(); retryRace() }}
          style={{
            width: '100%', marginBottom: 10,
            background: 'transparent', color: 'var(--text-dim)',
            border: '1px dashed var(--line-hair)', borderRadius: 8,
            padding: '10px 0', fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '0.08em', cursor: 'pointer',
          }}
        >
          ↺ RETRY THIS ROUND · different conditions
        </motion.button>
      </div>
      <div style={{ padding: '0 16px 12px', borderTop: '1px solid var(--line-hair)', paddingTop: 12, display: 'flex', gap: 10, flexShrink: 0 }}>
        {/* nextRace() already routes to the championship screen once raceIndex+1
            reaches TOTAL_RACES. This button used to be disabled precisely when
            isSeasonEnd, which made it the only caller of the only path to that
            screen — so the champion reveal was unreachable and a finished season
            just dead-ended here. */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => { uiTap(); nextRace() }}
          style={{
            flex: 1, background: 'var(--accent)',
            color: 'var(--bg-deep)',
            border: 'none',
            borderRadius: 10, padding: '16px 0',
            fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
            letterSpacing: '0.08em', cursor: 'pointer',
          }}
        >
          {isSeasonEnd ? 'FINAL STANDINGS →' : 'NEXT RACE →'}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => { uiTap(); playAgain() }}
          style={{
            flex: 0, minWidth: 90,
            background: 'transparent', color: 'var(--text-mid)',
            border: '1px solid var(--line-hair)',
            borderRadius: 10, padding: '16px 0',
            fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
            letterSpacing: '0.08em', cursor: 'pointer',
          }}
        >
          MENU
        </motion.button>
      </div>
    </motion.div>
  )
}
