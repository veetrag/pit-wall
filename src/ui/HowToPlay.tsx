import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import { useUiTap } from '@hooks/useUiTap'
import { ScreenFrame, ScreenHeader, KitButton, snapIn, useReducedMotion, PRESS } from '@ui/kit'

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
    body: 'Score points across 12 races. P1 = 25 pts, down to P10 = 1 pt. The season winner is decided on total points — consistency beats single-race heroics.',
  },
]

export function HowToPlay() {
  const [step, setStep] = useState(0)
  const exitHowToPlay = useSeasonStore(s => s.exitHowToPlay)
  const startNewSeason = useSeasonStore(s => s.startNewSeason)
  const isLast = step === STEPS.length - 1
  const current = STEPS[step]!
  const uiTap = useUiTap()
  const reduced = useReducedMotion()
  const enter = snapIn(reduced)

  return (
    <ScreenFrame label="How to play">
      <ScreenHeader
        eyebrow={`HOW TO PLAY · ${step + 1} OF ${STEPS.length}`}
        title={current.title}
        right={
          <motion.button type="button" whileTap={{ scale: 0.96 }} transition={PRESS} className="kit-focus"
            onClick={() => { uiTap(); exitHowToPlay() }}
            style={{ height: 48, padding: '0 8px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--lilac)', fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 14, letterSpacing: 1 }}>
            SKIP
          </motion.button>
        }
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '16px' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={enter.initial} animate={enter.animate} exit={{ opacity: 0 }} transition={enter.transition}
            className="slant-lg"
            style={{ background: 'var(--grape)', padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div aria-hidden="true" style={{ fontSize: 48, lineHeight: 1 }}>{current.icon}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--lilac)', lineHeight: 1.5 }}>
              {current.body}
            </div>
          </motion.div>
        </AnimatePresence>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))`, gap: 3, marginTop: 20 }}>
          {STEPS.map((_, i) => (
            <button key={i} type="button" aria-label={`Step ${i + 1}`} aria-current={i === step ? 'step' : undefined}
              className="kit-focus" onClick={() => { uiTap(); setStep(i) }}
              style={{ height: 48, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <span aria-hidden="true" style={{ display: 'block', width: '100%', height: 8, transform: 'skewX(-20deg)',
                background: i < step ? 'var(--volt)' : i === step ? 'var(--white)' : 'var(--dusk)' }} />
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '12px 16px calc(16px + var(--safe-bottom, 0px))', display: 'flex', gap: 10, flexShrink: 0 }}>
        {step > 0 && (
          <div style={{ flex: 1 }}>
            <KitButton variant="secondary" size="lg" onClick={() => setStep(s => s - 1)} style={{ width: '100%' }}>← BACK</KitButton>
          </div>
        )}
        <div style={{ flex: 2 }}>
          <KitButton variant="primary" size="lg" onClick={() => { if (isLast) startNewSeason(); else setStep(s => s + 1) }} style={{ width: '100%' }}>
            {isLast ? 'START RACING →' : 'NEXT →'}
          </KitButton>
        </div>
      </div>
    </ScreenFrame>
  )
}
