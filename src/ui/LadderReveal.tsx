import { useEffect, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { useSettingsStore } from '@state/settingsStore'
import { useHaptics, ImpactStyle } from '@hooks/useHaptics'
import { soundService } from '@audio/soundService'
import { constructorsTable, type LadderMove } from '@state/teamLadder'
import { loadGameData } from '@data/validators'
import { HeroBand, StatTile, StandingRow, EASE } from '@ui/kit'

const DATA = loadGameData()
const DRIVER_TEAM = new Map(DATA.drivers.drivers.map(d => [d.id, d.teamId] as [string, string]))
const TEAM_NAME = new Map(DATA.cars.teams.map(t => [t.id, t.name]))
const TEAM_COLOR = new Map(DATA.cars.teams.map(t => [t.id, t.colorPrimary]))
const { step: TIER_STEP, facets: TIER_FACETS } = DATA.tuning.career.teamTiers
const teamName = (id: string) => TEAM_NAME.get(id) ?? id
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`

/** Screen-reader-only text: the verdict string the display lines split in two. */
export const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}

type Verdict = { text: string; lines: [string, string?]; band: string; ink: string }
function verdictOf(m: LadderMove): Verdict {
  if (m.after > m.before) return { text: '▲ STEP UP', lines: ['▲ STEP', 'UP'], band: 'var(--gain)', ink: 'var(--ink)' }
  if (m.after < m.before) return { text: '▼ STEP DOWN', lines: ['▼ STEP', 'DOWN'], band: 'var(--hot)', ink: 'var(--ink)' }
  // A hold is neither earned nor lost: dusk, and white text on it.
  return { text: '● HELD', lines: ['● HELD'], band: 'var(--dusk)', ink: 'var(--white)' }
}

/** One sentence that says why: finished against deserved. */
function verdictSentence(m: LadderMove): string {
  const k = Math.abs(m.deserved - m.finished)
  const head = `You finished P${m.finished} in the constructors' — `
  if (k === 0) return `${head}exactly where the car deserved.`
  return `${head}${k} ${k === 1 ? 'place' : 'places'} ${m.finished < m.deserved ? 'above' : 'below'} where the car deserved.`
}

/**
 * Big Shoulders has no ▲ ▼ ●, so the fallback font draws them far taller than
 * the caps; the glyph is set smaller and lifted to sit on the cap height.
 */
function Glyphed({ line }: { line: string }) {
  const [glyph, ...rest] = line.split(' ')
  return <><span style={{ fontSize: '0.5em', verticalAlign: '0.35em' }}>{glyph}</span> {rest.join(' ')}</>
}

const VERDICT_DELAY = 0.7

const display: CSSProperties = { fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 96, lineHeight: 0.85, textTransform: 'uppercase' }
const label: CSSProperties = { fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12, letterSpacing: 2, color: 'var(--lilac-dim)' }

/**
 * The season's one orchestrated moment for the ladder (CLAUDE.md §6.2): a
 * full-width verdict band, what it does to the car, then who else moved.
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
  const delta = (mine.after - mine.before) * TIER_STEP
  const enter = (delay: number) => reducedMotion
    ? { initial: false as const, animate: { opacity: 1 } }
    : { initial: { opacity: 0, x: -18 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.18, delay, ease: EASE } }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* The band is skewed -8deg: ~30px of drop across a phone, so the text
          is padded clear of both slanted edges. */}
      <div style={{ position: 'relative', overflow: 'hidden', minHeight: 340, padding: '58px 24px 44px', boxSizing: 'border-box' }}>
        <HeroBand color={v.band} height={300} top={20} />
        <div style={{ position: 'relative', color: v.ink, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <motion.div {...enter(VERDICT_DELAY)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Readers get the verdict as one string; the display lines are hidden from them. */}
            <span style={VISUALLY_HIDDEN}>{v.text}</span>
            <span aria-hidden="true" style={display}><Glyphed line={v.lines[0]} /></span>
            {v.lines[1] && <span aria-hidden="true" style={display}>{v.lines[1]}</span>}
          </motion.div>
          <motion.div {...enter(0.1)} aria-label={`Tier ${signed(mine.before)} to ${signed(mine.after)}`}
            style={{ marginTop: 14, fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 18, overflowWrap: 'anywhere' }}>
            {teamName(playerTeamId)} · Tier {signed(mine.before)} → {signed(mine.after)}
          </motion.div>
          <motion.div {...enter(0.35)} style={{ marginTop: 6, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 15, lineHeight: 1.3, maxWidth: 310 }}>
            {verdictSentence(mine)}
          </motion.div>
          {/* The sentence says both positions; readers also get them as labels. */}
          <span style={VISUALLY_HIDDEN}>
            <span aria-label={`Deserved P${mine.deserved}`}>Deserved P{mine.deserved}</span>
            <span aria-label={`Finished P${mine.finished}`}>Finished P{mine.finished}</span>
          </span>
        </div>
      </div>

      <motion.div {...enter(VERDICT_DELAY + 0.1)} style={{ margin: '0 16px', display: 'grid', gridTemplateColumns: `repeat(${TIER_FACETS.length}, minmax(0, 1fr))`, gap: 6 }}>
        {TIER_FACETS.map(f => (
          <StatTile key={f} label={f.toUpperCase()} value={delta === 0 ? '±0' : signed(delta)}
            tone={delta > 0 ? 'gain' : delta < 0 ? 'hot' : 'default'} />
        ))}
      </motion.div>

      <motion.div {...enter(0.95)} className="slant-lg"
        style={{ margin: '0 16px', background: 'var(--night)', padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={label}>ACROSS THE GRID</span>
        {movers.length > 0 ? (
          <span aria-label="Grid movers" style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14, lineHeight: 1.35, color: 'var(--white)' }}>
            {movers.map((m, i) => {
              const rose = m.after > m.before
              return (
                <span key={m.teamId}>
                  {i > 0 && ' · '}
                  <span style={{ color: rose ? 'var(--gain)' : 'var(--hot)' }}>{rose ? '▲' : '▼'}</span>
                  {' '}{teamName(m.teamId)} {rose ? 'stepped up' : 'slipped'}
                </span>
              )
            })}
          </span>
        ) : (
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14, color: 'var(--white)' }}>
            No other team changed tier.
          </span>
        )}
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--lilac)' }}>
          Rival development resets for the new season.
        </span>
      </motion.div>
    </div>
  )
}

/** The constructors' championship, folded from the drivers'. */
export function ConstructorsList({ standings, playerTeamId }: {
  standings: readonly { driverId: string; points: number }[]
  playerTeamId: string
}) {
  const rows = constructorsTable(standings, DRIVER_TEAM)
  const leader = rows[0]?.points ?? 0
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.map((r, i) => {
        const me = r.teamId === playerTeamId
        return (
          <li key={r.teamId} aria-current={me ? 'true' : undefined}>
            <StandingRow pos={i + 1} teamColor={TEAM_COLOR.get(r.teamId) ?? 'var(--dusk)'} name={teamName(r.teamId)}
              value={r.points} bar={leader > 0 ? r.points / leader : 0} mine={me} />
          </li>
        )
      })}
    </ul>
  )
}
