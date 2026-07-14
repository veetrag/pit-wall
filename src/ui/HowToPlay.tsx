import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import { useUiTap } from '@hooks/useUiTap'

const STEPS = [
  {
    icon: '🏎',
    title: 'Your role',
    body: 'You are the race strategist, not the driver. You watch the race unfold and make the calls that win — when to pit, which tyre to fit, and how hard to push.',
  },
  {
    icon: '⏱',
    title: 'Pace mode',
    body: 'PUSH for fast laps but heavy tyre wear. CONSERVE to extend your stint. NEUTRAL is the baseline. Switch modes live during the race to reshape the math.',
  },
  {
    icon: '🔧',
    title: 'Pit stop',
    body: 'Tap PIT NOW to bring your car in. Choose the compound and see a projected rejoin position before you commit. Timing is everything — undercut rivals or extend for the overcut.',
  },
  {
    icon: '🌡',
    title: 'Tyre cliff',
    body: 'The gauge pulses red as tyres approach the cliff. Past the cliff, lap times collapse fast. Pit before it hits — or gamble if you\'re hunting a position.',
  },
  {
    icon: '🌧',
    title: 'Weather',
    body: 'Watch the forecast strip. If rain arrives on dry tyres you\'ll lose seconds per lap. React fast — intermediate or wet tyres must go on before the car starts sliding.',
  },
  {
    icon: '🏆',
    title: 'Championship',
    body: 'Score points across 8 races. P1 = 25 pts, down to P10 = 1 pt. The season winner is decided on total points — consistency beats single-race heroics.',
  },
]

export function HowToPlay() {
  const [step, setStep] = useState(0)
  const exitHowToPlay = useSeasonStore(s => s.exitHowToPlay)
  const startNewSeason = useSeasonStore(s => s.startNewSeason)
  const isLast = step === STEPS.length - 1
  const current = STEPS[step]!
  const uiTap = useUiTap()

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
      <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--line-hair)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>HOW TO PLAY</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>Strategy primer</div>
        </div>
        <motion.button whileTap={{ scale: 0.94 }} onClick={() => { uiTap(); exitHowToPlay() }}
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--line-hair)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)', letterSpacing: '0.08em' }}>
          SKIP
        </motion.button>
      </div>

      {/* Step card */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.18 }}
            style={{
              background: 'var(--bg-elevated)', borderRadius: 20, border: '1px solid var(--line-hair)',
              padding: '36px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16,
            }}
          >
            <div style={{ fontSize: 54, lineHeight: 1 }}>{current.icon}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em' }}>
              {current.title}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-mid)', lineHeight: 1.65, maxWidth: 280 }}>
              {current.body}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 24 }}>
          {STEPS.map((_, i) => (
            <motion.div
              key={i}
              animate={{ width: i === step ? 22 : 8, background: i === step ? 'var(--accent)' : 'var(--line-hair)' }}
              style={{ height: 8, borderRadius: 4, cursor: 'pointer' }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              onClick={() => setStep(i)}
            />
          ))}
        </div>
      </div>

      {/* Nav */}
      <div style={{ padding: '12px 24px 16px', display: 'flex', gap: 10, flexShrink: 0 }}>
        {step > 0 && (
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => { uiTap(); setStep(s => s - 1) }}
            style={{
              flex: 1, background: 'transparent', color: 'var(--text-mid)',
              border: '1px solid var(--line-hair)', borderRadius: 10, padding: '14px 0',
              fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600,
              letterSpacing: '0.08em', cursor: 'pointer',
            }}>
            ← BACK
          </motion.button>
        )}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => { uiTap(); if (isLast) startNewSeason(); else setStep(s => s + 1) }}
          style={{
            flex: 2, background: isLast ? 'var(--accent)' : 'var(--bg-elevated)',
            color: isLast ? 'var(--bg-deep)' : 'var(--text-hi)',
            border: isLast ? 'none' : '1px solid var(--line-hair)',
            borderRadius: 10, padding: '16px 0',
            fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
            letterSpacing: '0.08em', cursor: 'pointer',
          }}>
          {isLast ? 'START RACING →' : 'NEXT →'}
        </motion.button>
      </div>
    </motion.div>
  )
}
