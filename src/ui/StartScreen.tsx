import { motion } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'

export function StartScreen() {
  const initForStartSequence = useRaceStore(s => s.initForStartSequence)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 1, transition: { duration: 0.18 } }}
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 32,
        background: 'var(--ink)',
      }}
    >
      <h1 style={{
        fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 700,
        color: 'var(--accent)', letterSpacing: '0.05em', textTransform: 'uppercase',
      }}>
        PIT WALL
      </h1>
      <p style={{ color: 'var(--text-mid)', fontFamily: 'var(--font-body)', fontSize: 16 }}>
        Test Session · Voss / Apex Racing
      </p>
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={initForStartSequence}
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
