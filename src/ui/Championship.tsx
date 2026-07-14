import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import { useUiTap } from '@hooks/useUiTap'
import driversData from '@data/drivers.json'

type DriverEntry = { id: string; name: string; teamId: string }
const drivers = driversData.drivers as DriverEntry[]

function driverName(id: string): string {
  return drivers.find(d => d.id === id)?.name ?? id.replace('d_', '').toUpperCase()
}

export function Championship() {
  const { standings, playerDriverId, playAgain } = useSeasonStore()
  const uiTap = useUiTap()

  const winner = standings[0]
  const playerStanding = standings.find(s => s.driverId === playerDriverId)
  const playerRank = standings.findIndex(s => s.driverId === playerDriverId) + 1

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-deep)',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {/* Header */}
      <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--line-hair)', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>
          SEASON 2025 COMPLETE
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>
          Championship
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* Champion card */}
        {winner && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            style={{
              background: 'var(--bg-elevated)', borderRadius: 14,
              border: '1px solid var(--tyre-medium)',
              padding: '20px', marginBottom: 20, textAlign: 'center',
              boxShadow: '0 0 40px rgba(242,201,76,0.15)',
            }}
          >
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tyre-medium)', letterSpacing: '0.2em', marginBottom: 6 }}>
              🏆 CHAMPION
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, color: winner.driverId === playerDriverId ? 'var(--accent)' : 'var(--text-hi)' }}>
              {driverName(winner.driverId).toUpperCase()}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--tyre-medium)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
              {winner.points} PTS
            </div>
            {winner.driverId === playerDriverId && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--positive)', marginTop: 8, letterSpacing: '0.1em' }}
              >
                YOU ARE THE CHAMPION
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Player summary if not champion */}
        {playerDriverId && winner?.driverId !== playerDriverId && playerStanding && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            style={{
              background: 'rgba(0,229,208,0.06)', borderRadius: 10,
              border: '1px solid var(--accent)',
              padding: '14px 18px', marginBottom: 16,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--accent)', letterSpacing: '0.1em' }}>YOU FINISHED</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--text-hi)' }}>P{playerRank}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>TOTAL PTS</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{playerStanding.points}</div>
            </div>
          </motion.div>
        )}

        {/* Full standings */}
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 8 }}>
          FINAL STANDINGS
        </div>
        {standings.map((s, i) => (
          <motion.div
            key={s.driverId}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * i }}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', borderRadius: 8,
              background: s.driverId === playerDriverId ? 'rgba(0,229,208,0.08)' : i === 0 ? 'rgba(242,201,76,0.06)' : 'transparent',
              borderLeft: s.driverId === playerDriverId ? '2px solid var(--accent)' : i === 0 ? '2px solid var(--tyre-medium)' : '2px solid transparent',
              marginBottom: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', width: 20 }}>
                {i + 1}
              </span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: s.driverId === playerDriverId ? 'var(--accent)' : i === 0 ? 'var(--tyre-medium)' : 'var(--text-hi)' }}>
                {driverName(s.driverId).toUpperCase()}
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-hi)', fontVariantNumeric: 'tabular-nums' }}>
              {s.points} PTS
            </span>
          </motion.div>
        ))}
      </div>

      {/* Play again */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line-hair)', flexShrink: 0 }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => { uiTap(); playAgain() }}
          style={{
            width: '100%', border: 'none', borderRadius: 10, padding: '16px',
            background: 'var(--accent)', color: 'var(--bg-deep)',
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
            letterSpacing: '0.08em', cursor: 'pointer',
          }}
        >
          PLAY AGAIN
        </motion.button>
      </div>
    </motion.div>
  )
}
