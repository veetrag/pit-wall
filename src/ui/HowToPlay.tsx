import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'

const SECTIONS = [
  {
    icon: '🏎',
    title: 'YOUR ROLE',
    body: 'You are the race strategist, not the driver. You watch the race unfold and make the calls that win — when to pit, which tyre to fit, and how hard to push.',
  },
  {
    icon: '⏱',
    title: 'PACE MODE',
    body: 'PUSH for fast laps but heavy tyre wear. CONSERVE to extend your stint. NEUTRAL is the baseline. Switch modes live during the race to reshape the math.',
  },
  {
    icon: '🔧',
    title: 'PIT STOP',
    body: 'Tap PIT NOW to bring your car in. Choose the compound and see a projected rejoin position before you commit. Timing is everything — undercut your rivals or extend for the overcut.',
  },
  {
    icon: '🌡',
    title: 'TYRE CLIFF',
    body: 'The gauge on your timing row pulses red as tyres approach the cliff. Past the cliff, lap times collapse fast. Pit before it hits — or gamble if you\'re hunting a position.',
  },
  {
    icon: '🌧',
    title: 'WEATHER',
    body: 'Watch the forecast strip. If rain arrives on dry tyres you\'ll lose seconds per lap. React fast — intermediate or wet tyres must go on before the car starts sliding.',
  },
  {
    icon: '🏆',
    title: 'CHAMPIONSHIP',
    body: 'Score points across 5 races. P1 = 25pts, down to P10 = 1pt. The season winner is decided on total points — consistency beats single-race heroics.',
  },
]

export function HowToPlay() {
  const exitHowToPlay = useSeasonStore(s => s.exitHowToPlay)

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
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>
            ONBOARDING
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>
            How to Play
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={exitHowToPlay}
          style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--line-hair)',
            borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)',
            letterSpacing: '0.08em', outline: 'none',
          }}
        >
          BACK
        </motion.button>
      </div>

      {/* Sections */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SECTIONS.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, ease: 'easeOut' }}
            style={{
              background: 'var(--bg-elevated)', borderRadius: 14,
              border: '1px solid var(--line-hair)',
              padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start',
            }}
          >
            <div style={{ fontSize: 24, flexShrink: 0, lineHeight: 1 }}>{s.icon}</div>
            <div>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700,
                color: 'var(--accent)', letterSpacing: '0.12em', marginBottom: 6,
              }}>
                {s.title}
              </div>
              <div style={{
                fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-mid)',
                lineHeight: 1.55,
              }}>
                {s.body}
              </div>
            </div>
          </motion.div>
        ))}

        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)',
          textAlign: 'center', letterSpacing: '0.1em', marginTop: 8, paddingBottom: 8,
        }}>
          GOOD LUCK, STRATEGIST
        </div>
      </div>
    </motion.div>
  )
}
