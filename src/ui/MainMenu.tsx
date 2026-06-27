import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'

export function MainMenu() {
  const startNewSeason = useSeasonStore(s => s.startNewSeason)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-deep)', gap: 0,
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
        position: 'relative',
      }}
    >
      {/* Logotype */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
          color: 'var(--accent)', letterSpacing: '0.3em', textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          F1 STRATEGIST
        </div>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 52, fontWeight: 800,
          color: 'var(--text-hi)', letterSpacing: '-0.01em', lineHeight: 1,
          textShadow: '0 0 60px rgba(0,229,208,0.25)',
        }}>
          PIT WALL
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)',
          marginTop: 10, letterSpacing: '0.15em',
        }}>
          SEASON 2025 · SILVERPARK
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 240 }}>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={startNewSeason}
          style={{
            background: 'var(--accent)', color: 'var(--bg-deep)',
            border: 'none', borderRadius: 10, padding: '18px 0',
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
            width: '100%',
          }}
        >
          NEW SEASON
        </motion.button>

        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)',
          textAlign: 'center', letterSpacing: '0.1em', marginTop: 8,
        }}>
          5 RACES · 10 DRIVERS
        </div>
      </div>

      {/* Version */}
      <div style={{
        position: 'absolute', bottom: 'calc(var(--safe-bottom) + 16px)',
        fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)',
        letterSpacing: '0.1em',
      }}>
        v0.1 ALPHA
      </div>
    </motion.div>
  )
}
