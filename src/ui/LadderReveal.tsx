import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useSettingsStore } from '@state/settingsStore'
import { useHaptics, ImpactStyle } from '@hooks/useHaptics'
import { soundService } from '@audio/soundService'
import { constructorsTable, type LadderMove } from '@state/teamLadder'
import { loadGameData } from '@data/validators'

const DATA = loadGameData()
const DRIVER_TEAM = new Map(DATA.drivers.drivers.map(d => [d.id, d.teamId] as [string, string]))
const TEAM_NAME = new Map(DATA.cars.teams.map(t => [t.id, t.name]))
const name = (id: string) => (TEAM_NAME.get(id) ?? id).toUpperCase()
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`

type Verdict = { text: string; color: string }
function verdictOf(m: LadderMove): Verdict {
  if (m.after > m.before) return { text: '▲ STEP UP', color: 'var(--accent)' }
  if (m.after < m.before) return { text: '▼ STEP DOWN', color: 'var(--accent-warm)' }
  return { text: '● HELD', color: 'var(--text-dim)' }
}

const VERDICT_DELAY = 0.7

/**
 * The season's one orchestrated moment for the ladder (CLAUDE.md §6.2):
 * deserved and finished positions, then the verdict, then who else moved.
 */
export function LadderReveal({ moves, playerTeamId }: { moves: LadderMove[]; playerTeamId: string }) {
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const { impact } = useHaptics()
  const mine = moves.find(m => m.teamId === playerTeamId)
  const stepped = mine !== undefined && mine.after !== mine.before
  const up = mine !== undefined && mine.after > mine.before

  // Feedback lands with the verdict, not on mount: the buzz is the verdict's
  // punctuation. Reduced motion shows everything at once, so it fires at once.
  useEffect(() => {
    if (!stepped) return
    const fire = () => {
      impact(ImpactStyle.Medium)
      if (up) soundService.play('positionGain')
    }
    if (reducedMotion) { fire(); return }
    const t = setTimeout(fire, VERDICT_DELAY * 1000)
    return () => clearTimeout(t)
  }, [stepped, up, reducedMotion]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!mine) return null
  const v = verdictOf(mine)
  const movers = moves.filter(m => m.teamId !== playerTeamId && m.after !== m.before)
  const enter = (delay: number) => reducedMotion
    ? { initial: false as const, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { delay, ease: [0.2, 0, 0, 1] as [number, number, number, number] } }

  return (
    <div style={{
      border: '1px solid var(--line-hair)', borderRadius: 10, padding: '12px 14px',
      background: 'var(--bg-panel)', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.15em' }}>
          CONSTRUCTORS'
        </span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.08em' }}>
          {name(playerTeamId)}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-mid)', display: 'grid', gap: 4 }}>
          <motion.div {...enter(0.1)} aria-label={`Deserved P${mine.deserved}`}>Deserved <b style={{ color: 'var(--text-hi)' }}>P{mine.deserved}</b></motion.div>
          <motion.div {...enter(0.35)} aria-label={`Finished P${mine.finished}`}>Finished <b style={{ color: 'var(--text-hi)' }}>P{mine.finished}</b></motion.div>
        </div>
        <motion.div {...enter(VERDICT_DELAY)} style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: v.color, letterSpacing: '0.08em' }}>
            {v.text}
          </div>
          <div aria-label={`Tier ${signed(mine.before)} to ${signed(mine.after)}`}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
            Tier {signed(mine.before)} → {signed(mine.after)}
          </div>
        </motion.div>
      </div>
      {movers.length > 0 && (
        <motion.div {...enter(0.95)} aria-label="Grid movers"
          style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--line-hair)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)' }}>
          {movers.map((m, i) => (
            <span key={m.teamId}>
              {i > 0 && ' · '}
              {name(m.teamId)}{' '}
              <span style={{ color: m.after > m.before ? 'var(--accent)' : 'var(--accent-warm)' }}>
                {m.after > m.before ? '▲' : '▼'}
              </span>
            </span>
          ))}
        </motion.div>
      )}
    </div>
  )
}

/** The constructors' championship, folded from the drivers'. */
export function ConstructorsList({ standings, playerTeamId }: {
  standings: readonly { driverId: string; points: number }[]
  playerTeamId: string
}) {
  const rows = constructorsTable(standings, DRIVER_TEAM)
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {rows.map((r, i) => {
        const me = r.teamId === playerTeamId
        return (
          <li key={r.teamId} aria-current={me ? 'true' : undefined} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px', borderRadius: 8, marginBottom: 4,
            background: me ? 'rgba(var(--volt-rgb), 0.08)' : 'transparent',
            borderLeft: me ? '2px solid var(--accent)' : '2px solid transparent',
          }}>
            <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', width: 20 }}>{i + 1}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: me ? 'var(--accent)' : 'var(--text-hi)' }}>
                {name(r.teamId)}
              </span>
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-hi)', fontVariantNumeric: 'tabular-nums' }}>
              {r.points} PTS
            </span>
          </li>
        )
      })}
    </ul>
  )
}
