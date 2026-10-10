import { motion } from 'framer-motion'
import { useScenarioStore } from '@state/scenarioStore'
import { useSettingsStore } from '@state/settingsStore'
import { useSeasonStore } from '@state/seasonStore'
import { useRaceStore } from '@state/raceStore'
import { useUiTap } from '@hooks/useUiTap'
import { ScreenFrame, ScreenHeader, HeroBand, KitButton, snapIn } from '@ui/kit'

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
    <ScreenFrame label="Scenario result">
      <ScreenHeader eyebrow="SCENARIO" title={active.name} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'relative', minHeight: 170 }}>
          <HeroBand color={met ? 'var(--gain)' : 'var(--hot)'} height={170} />
          <motion.div
            role="status"
            {...snapIn(reducedMotion)}
            style={{
              position: 'relative', height: 170, padding: '0 24px', boxSizing: 'border-box',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, color: 'var(--ink)',
            }}
          >
            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 64,
              lineHeight: 0.95, textTransform: 'uppercase', overflowWrap: 'anywhere',
            }}>
              {verdictMark} {verdictText}
            </div>
            <div style={{
              fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 16, display: 'flex', flexWrap: 'wrap',
              alignItems: 'center', gap: 10,
            }}>
              <span>{`TARGET P${active.goal.position}`}</span>
              <span aria-hidden>·</span>
              <span>{outcome.retired ? 'RETIRED' : `FINISHED P${outcome.position}`}</span>
            </div>
          </motion.div>
        </div>
      </div>

      <div style={{ padding: '0 16px calc(12px + var(--safe-bottom))', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
        <KitButton variant="primary" size="lg" onClick={tryAgain}>TRY AGAIN</KitButton>
        <KitButton variant="secondary" size="sm" onClick={toMenu}>BACK TO MENU</KitButton>
      </div>
    </ScreenFrame>
  )
}
