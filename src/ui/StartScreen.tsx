import { motion } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { useClockStore } from '@state/clockStore'

export function StartScreen() {
  const startRace = useRaceStore(s => s.startRace)
  const setSpeed = useClockStore(s => s.setSpeed)

  function handleStart() {
    startRace()
    setSpeed(1)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 32,
        background: 'var(--bg-deep)',
      }}
    >
      <h1 style={{
        fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 700,
        color: 'var(--accent)', letterSpacing: '0.05em', textTransform: 'uppercase',
      }}>
        F1 Strategist
      </h1>
      <p style={{ color: 'var(--text-mid)', fontFamily: 'var(--font-body)', fontSize: 16 }}>
        Silverpark · 30 Laps · Verstael / Apex Racing
      </p>
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={handleStart}
        style={{
          background: 'var(--accent)', color: 'var(--bg-deep)',
          border: 'none', borderRadius: 8, padding: '16px 48px',
          fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
        }}
      >
        Start Race
      </motion.button>
    </motion.div>
  )
}
