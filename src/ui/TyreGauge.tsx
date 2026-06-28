import { motion } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { tyreCliffFraction } from '@engine/index'

const COMPOUND_LABEL: Record<string, string> = { S: 'SOFT', M: 'MED', H: 'HARD', I: 'INTER', W: 'WET' }
const COMPOUND_COLOR: Record<string, string> = {
  S: 'var(--tyre-soft)',
  M: 'var(--tyre-medium)',
  H: 'var(--tyre-hard)',
  I: 'var(--tyre-inter, #39B54A)',
  W: 'var(--tyre-wet, #4DA6FF)',
}

function cliffColor(fraction: number): string {
  if (fraction >= 1.0) return 'var(--accent-warm)'
  if (fraction >= 0.75) return '#F2C94C'
  return 'var(--accent)'
}

export function TyreGauge() {
  const raceState = useRaceStore(s => s.raceState)
  const config = useRaceStore(s => s.config)

  if (!raceState || !config) return null
  const player = raceState.cars.find(c => c.isPlayer)
  if (!player) return null

  const spec = config.compounds[player.compound]
  if (!spec) return null

  const fraction = tyreCliffFraction(spec, player.tyreAge)
  const fillPct = Math.min(fraction * 100, 100)
  const color = cliffColor(fraction)
  const lapsToCliff = Math.max(0, Math.ceil(spec.cliff - player.tyreAge))
  const isPulsing = fraction >= 0.80
  const isPastCliff = fraction >= 1.0
  const compoundColor = COMPOUND_COLOR[player.compound] ?? color

  return (
    <div style={{
      background: 'var(--bg-panel)', borderRadius: 8, padding: '8px 12px',
      border: `1px solid ${isPastCliff ? 'var(--accent-warm)' : 'var(--line-hair)'}`,
      minWidth: 130, flex: 1,
      transition: 'border-color 0.4s',
    }}>
      {/* Header row: compound dot + name + age */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: compoundColor, display: 'inline-block', flexShrink: 0,
          }} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            color: 'var(--text-dim)', letterSpacing: '0.1em',
          }}>
            {COMPOUND_LABEL[player.compound] ?? player.compound}
          </span>
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
          color, letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums',
          transition: 'color 0.4s',
        }}>
          L{player.tyreAge}
        </span>
      </div>

      {/* Wear bar */}
      <div style={{
        height: 5, borderRadius: 3,
        background: 'var(--bg-deep)', overflow: 'hidden', marginBottom: 5,
      }}>
        <motion.div
          animate={isPulsing ? { opacity: [1, 0.45, 1] } : { opacity: 1 }}
          transition={isPulsing ? { duration: isPastCliff ? 0.6 : 1.1, repeat: Infinity, ease: 'easeInOut' } : {}}
          style={{
            height: '100%', borderRadius: 3,
            width: `${fillPct}%`,
            background: color,
            boxShadow: isPulsing ? `0 0 8px ${color}` : 'none',
            transition: 'width 0.5s ease, background 0.4s ease',
          }}
        />
      </div>

      {/* Cliff countdown or warning */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontVariantNumeric: 'tabular-nums' }}>
        {isPastCliff ? (
          <motion.span
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 0.7, repeat: Infinity }}
            style={{ color: 'var(--accent-warm)', fontWeight: 700, letterSpacing: '0.1em' }}
          >
            BOX BOX BOX
          </motion.span>
        ) : fraction >= 0.65 ? (
          <span style={{ color }}>
            CLIFF ~{lapsToCliff}L
          </span>
        ) : (
          <span style={{ color: 'var(--text-dim)' }}>
            {lapsToCliff}L to cliff
          </span>
        )}
      </div>
    </div>
  )
}
