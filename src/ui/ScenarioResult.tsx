import { motion } from 'framer-motion'
import { useScenarioStore } from '@state/scenarioStore'
import { useSettingsStore } from '@state/settingsStore'
import { useSeasonStore } from '@state/seasonStore'
import { useRaceStore } from '@state/raceStore'
import { useUiTap } from '@hooks/useUiTap'

/**
 * Scenario mode's result screen -- judged against the authored `goal`, not
 * against championship points (scenarios never touch seasonStore standings).
 *
 * Mirrors RaceResult.tsx's visual language (dark panel, mono/display type
 * pairing, teal/warm verdict colours) but is a much smaller surface: a
 * scenario has no podium, no classification, no championship preview -- just
 * "did you meet the goal" plus a way to try again or leave.
 */
export function ScenarioResult() {
  const active = useScenarioStore(s => s.active)
  const outcome = useScenarioStore(s => s.outcome)
  const exit = useScenarioStore(s => s.exit)
  const startScenarioPhase = useSeasonStore(s => s.startScenarioPhase)
  const backToMenu = useSeasonStore(s => s.backToMenu)
  const uiTap = useUiTap()
  // Matches ScenarioSelect and CoachMark; RaceResult is the only new-adjacent
  // screen that reads the media query directly instead.
  const reducedMotion = useSettingsStore(s => s.reducedMotion)

  // Defensive guard: this route is only reachable once select() + a completed
  // race have populated both. Never expected in practice.
  if (!active || !outcome) return null

  const met = outcome.met
  const verdictColor = met ? 'var(--positive)' : 'var(--accent-warm)'
  const verdictText = met ? 'GOAL MET' : 'GOAL MISSED'
  const verdictMark = met ? '✓' : '✗'

  function tryAgain() {
    uiTap()
    // RaceWatcher only (re-)starts a scenario race when raceStore.phase is
    // 'idle'. The previous race left it 'finished' -- reset FIRST, or
    // startScenarioPhase() routes here with nothing driving the race forward.
    useRaceStore.getState().resetRace()
    startScenarioPhase()
  }

  function toMenu() {
    uiTap()
    exit()
    backToMenu()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-deep)',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      }}
    >
      <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--line-hair)', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>
          SCENARIO
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>
          {active.name}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <motion.div
          role="status"
          initial={reducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          style={{
            background: 'var(--bg-panel)', border: `1px solid ${verdictColor}`, borderRadius: 12,
            padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center',
          }}
        >
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800,
            letterSpacing: '0.06em', color: verdictColor,
          }}>
            {verdictMark} {verdictText}
          </div>

          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-mid)',
            display: 'flex', alignItems: 'center', gap: 10, fontVariantNumeric: 'tabular-nums',
          }}>
            <span>{`TARGET P${active.goal.position}`}</span>
            <span style={{ color: 'var(--line-hair)' }} aria-hidden>·</span>
            <span style={{ color: 'var(--text-hi)' }}>
              {outcome.retired ? 'RETIRED' : `FINISHED P${outcome.position}`}
            </span>
          </div>
        </motion.div>
      </div>

      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 10, flexShrink: 0 }}>
        <motion.button
          type="button"
          whileTap={reducedMotion ? undefined : { scale: 0.97 }}
          onClick={tryAgain}
          style={{
            flex: 1, background: 'var(--accent)', color: 'var(--bg-deep)',
            border: 'none', borderRadius: 10, padding: '16px 0',
            fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
            letterSpacing: '0.08em', cursor: 'pointer',
          }}
        >
          TRY AGAIN
        </motion.button>
        <motion.button
          type="button"
          whileTap={reducedMotion ? undefined : { scale: 0.97 }}
          onClick={toMenu}
          style={{
            flex: 0, minWidth: 110, background: 'transparent', color: 'var(--text-mid)',
            border: '1px solid var(--line-hair)', borderRadius: 10, padding: '16px 0',
            fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
            letterSpacing: '0.08em', cursor: 'pointer',
          }}
        >
          BACK TO MENU
        </motion.button>
      </div>
    </motion.div>
  )
}
