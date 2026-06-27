import { motion, AnimatePresence } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import type { CarState, Compound, CompoundSpec } from '@engine/types'

const COMPOUND_COLORS: Record<Compound, string> = {
  S: 'var(--tyre-soft)',
  M: 'var(--tyre-medium)',
  H: 'var(--tyre-hard)',
}

function formatGap(gap: number, position: number): string {
  if (position === 1) return 'LEADER'
  return `+${gap.toFixed(3)}`
}

function CompoundDot({ compound, age, spec }: { compound: Compound; age: number; spec: CompoundSpec }) {
  const fraction = spec.cliff > 0 ? age / spec.cliff : 0
  const worn = fraction > 0.85
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: COMPOUND_COLORS[compound],
      opacity: worn ? 0.5 : 1,
      boxShadow: worn ? 'none' : `0 0 4px ${COMPOUND_COLORS[compound]}`,
      flexShrink: 0,
    }} />
  )
}

function TowerRow({ car, leaderTime, compounds }: {
  car: CarState
  leaderTime: number
  compounds: Record<Compound, CompoundSpec>
}) {
  const gap = car.raceTime - leaderTime
  const spec = compounds[car.compound]!
  const modeColor = car.paceMode === 'push'
    ? 'var(--accent-warm)'
    : car.paceMode === 'conserve'
    ? 'var(--positive)'
    : 'var(--text-dim)'

  const driverCode = car.driverId.replace('d_', '').toUpperCase().slice(0, 3)

  return (
    <motion.div
      layout
      layoutId={car.driverId}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
      style={{
        display: 'grid',
        gridTemplateColumns: '20px 34px 1fr 12px 26px 8px',
        alignItems: 'center',
        gap: 5,
        padding: '5px 10px',
        borderRadius: 4,
        background: car.isPlayer ? 'rgba(0,229,208,0.08)' : 'transparent',
        borderLeft: car.isPlayer ? '2px solid var(--accent)' : '2px solid transparent',
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>
        {car.position}
      </span>
      <span style={{
        fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
        color: car.isPlayer ? 'var(--accent)' : 'var(--text-hi)', letterSpacing: '0.05em',
      }}>
        {driverCode}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)', fontVariantNumeric: 'tabular-nums', minWidth: 0 }}>
        {formatGap(gap, car.position)}
      </span>
      <CompoundDot compound={car.compound} age={car.tyreAge} spec={spec} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>
        L{car.tyreAge}
      </span>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: modeColor, display: 'inline-block', flexShrink: 0 }} />
    </motion.div>
  )
}

export function TimingTower() {
  const raceState = useRaceStore(s => s.raceState)
  const config = useRaceStore(s => s.config)

  if (!raceState || !config) return null

  const leaderTime = raceState.cars[0]?.raceTime ?? 0
  const sorted = [...raceState.cars].sort((a, b) => a.position - b.position)

  return (
    <div style={{
      background: 'var(--bg-panel)', borderRadius: 8,
      padding: '8px 0', width: '100%',
      border: '1px solid var(--line-hair)',
    }}>
      <div style={{
        padding: '6px 10px 8px',
        fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600,
        color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase',
        borderBottom: '1px solid var(--line-hair)',
        marginBottom: 4,
      }}>
        Lap {raceState.lap + 1} / {raceState.totalLaps}
      </div>
      <AnimatePresence initial={false}>
        {sorted.map(car => (
          <TowerRow
            key={car.driverId}
            car={car}
            leaderTime={leaderTime}
            compounds={config.compounds}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
