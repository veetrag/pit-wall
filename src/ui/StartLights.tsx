import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { useClockStore } from '@state/clockStore'
import { useSettingsStore } from '@state/settingsStore'
import { soundService } from '@audio/soundService'
import { useHaptics, ImpactStyle } from '@hooks/useHaptics'

const NUM_LIGHTS = 5
const LIGHT_INTERVAL = 1000
const LIGHTS_OUT_DELAY = 600

export function StartLights() {
  const confirmRaceStart = useRaceStore(s => s.confirmRaceStart)
  const setSpeed = useClockStore(s => s.setSpeed)
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const { impact } = useHaptics()
  const [litCount, setLitCount] = useState(0)
  const [lightsOut, setLightsOut] = useState(false)
  const [showGo, setShowGo] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (reducedMotion) {
      soundService.play('lightsOut')
      confirmRaceStart()
      setSpeed(1)
      return
    }

    const timers: ReturnType<typeof setTimeout>[] = []

    for (let i = 1; i <= NUM_LIGHTS; i++) {
      timers.push(setTimeout(() => {
        setLitCount(i)
        soundService.play('tick')
        impact(ImpactStyle.Light)
      }, i * LIGHT_INTERVAL))
    }

    const totalLightTime = NUM_LIGHTS * LIGHT_INTERVAL + LIGHTS_OUT_DELAY
    timers.push(setTimeout(() => {
      setLightsOut(true)
      setShowGo(true)
      soundService.play('lightsOut')
      impact(ImpactStyle.Heavy)
    }, totalLightTime))

    timers.push(setTimeout(() => {
      confirmRaceStart()
      setSpeed(1)
      setDone(true)
    }, totalLightTime + 800))

    return () => timers.forEach(clearTimeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (done) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute', inset: 0, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(10,14,26,0.92)', zIndex: 200, gap: 32,
      }}
    >
      <div style={{
        background: 'var(--bg-elevated)', borderRadius: 12,
        padding: '18px 28px', border: '1px solid var(--line-hair)',
        display: 'flex', gap: 16, alignItems: 'center',
      }}>
        {Array.from({ length: NUM_LIGHTS }, (_, i) => {
          const lit = !lightsOut && litCount > i
          return (
            <motion.div
              key={i}
              animate={lit ? { scale: [1, 1.15, 1], boxShadow: ['0 0 0px #FF4D5E', '0 0 24px #FF4D5E', '0 0 16px #FF4D5E'] } : {}}
              transition={{ duration: 0.3 }}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: lit ? 'var(--accent-warm)' : 'var(--bg-deep)',
                border: '2px solid var(--line-hair)',
                boxShadow: lit ? '0 0 16px var(--accent-warm)' : 'none',
                transition: 'background 0.15s ease, box-shadow 0.15s ease',
              }}
            />
          )
        })}
      </div>

      <AnimatePresence>
        {showGo && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            style={{
              fontFamily: 'var(--font-display)', fontSize: 64, fontWeight: 700,
              color: 'var(--positive)', letterSpacing: '0.1em',
              textShadow: '0 0 40px var(--positive)',
            }}
          >
            GO
          </motion.div>
        )}
      </AnimatePresence>

      {!showGo && (
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-dim)',
          letterSpacing: '0.15em', textTransform: 'uppercase',
        }}>
          {litCount < NUM_LIGHTS ? 'Formation lap complete' : 'Lights out...'}
        </div>
      )}
    </motion.div>
  )
}
