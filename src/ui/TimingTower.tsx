import { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import type { CarState, Compound, CompoundSpec } from '@engine/types'

const COMPOUND_COLORS: Record<Compound, string> = {
  S: 'var(--tyre-soft)',
  M: 'var(--tyre-medium)',
  H: 'var(--tyre-hard)',
  I: 'var(--tyre-inter, #39B54A)',
  W: 'var(--tyre-wet, #4DA6FF)',
}

function formatGap(gap: number, position: number): string {
  if (position === 1) return 'LEAD'
  return `+${gap.toFixed(1)}`
}

function WearBar({ compound, age, spec }: { compound: Compound; age: number; spec: CompoundSpec }) {
  const fraction = spec.cliff > 0 ? Math.min(age / spec.cliff, 1.2) : 0
  const fillPct = Math.min(fraction * 100, 100)
  const color = fraction >= 1.0
    ? 'var(--accent-warm)'
    : fraction >= 0.70
    ? '#F2C94C'
    : 'var(--accent)'
  const dotColor = COMPOUND_COLORS[compound]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: dotColor, flexShrink: 0,
        boxShadow: fraction < 0.7 ? `0 0 4px ${dotColor}` : 'none',
      }} />
      <div style={{
        width: 26, height: 3, borderRadius: 2,
        background: 'var(--bg-deep)', overflow: 'hidden', flexShrink: 0,
      }}>
        <div style={{
          height: '100%', borderRadius: 2,
          width: `${fillPct}%`,
          background: color,
          transition: 'width 0.5s ease, background 0.5s ease',
        }} />
      </div>
    </div>
  )
}

function TowerRow({ car, leaderTime, prevGapRef, compounds }: {
  car: CarState
  leaderTime: number
  prevGapRef: React.MutableRefObject<Map<string, number>>
  compounds: Record<string, CompoundSpec>
}) {
  const gap = car.raceTime - leaderTime
  const spec = compounds[car.compound]
  const driverCode = car.driverId.replace('d_', '').toUpperCase().slice(0, 3)

  const prevPosRef = useRef(car.position)
  const [flash, setFlash] = useState<'gain' | 'loss' | null>(null)

  useEffect(() => {
    if (car.position < prevPosRef.current) {
      setFlash('gain')
      const t = setTimeout(() => setFlash(null), 700)
      prevPosRef.current = car.position
      return () => clearTimeout(t)
    } else if (car.position > prevPosRef.current) {
      setFlash('loss')
      const t = setTimeout(() => setFlash(null), 700)
      prevPosRef.current = car.position
      return () => clearTimeout(t)
    }
  }, [car.position])

  // Momentum: compare gap to previous gap for this car
  const prevGap = prevGapRef.current.get(car.driverId) ?? gap
  useEffect(() => { prevGapRef.current.set(car.driverId, gap) })
  const gapDelta = car.position === 1 ? 0 : gap - prevGap
  const gapColor = car.position === 1
    ? 'var(--text-dim)'
    : gapDelta < -0.05
    ? 'var(--positive)'
    : gapDelta > 0.05
    ? 'var(--negative)'
    : 'var(--text-mid)'

  const flashBg = flash === 'gain'
    ? 'rgba(61,220,132,0.12)'
    : flash === 'loss'
    ? 'rgba(255,107,107,0.12)'
    : car.isPlayer
    ? 'rgba(0,229,208,0.07)'
    : 'transparent'

  return (
    <motion.div
      layout
      layoutId={car.driverId}
      transition={{ type: 'spring', stiffness: 450, damping: 38 }}
      style={{
        display: 'grid',
        gridTemplateColumns: '18px 32px 1fr 44px',
        alignItems: 'center',
        gap: 4,
        padding: '5px 10px',
        background: flashBg,
        borderLeft: car.isPlayer ? '2px solid var(--accent)' : '2px solid transparent',
        borderBottom: '0.5px solid #141a2b',
        transition: 'background 0.4s ease',
      }}
    >
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10,
        color: flash === 'gain' ? 'var(--positive)' : flash === 'loss' ? 'var(--negative)' : 'var(--text-dim)',
        fontVariantNumeric: 'tabular-nums', transition: 'color 0.3s',
      }}>
        {car.position}
      </span>
      <span style={{
        fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700,
        color: car.isPlayer ? 'var(--accent)' : 'var(--text-hi)', letterSpacing: '0.04em',
      }}>
        {driverCode}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, color: gapColor,
        fontVariantNumeric: 'tabular-nums', minWidth: 0,
        transition: 'color 0.5s',
      }}>
        {formatGap(gap, car.position)}
      </span>
      {spec ? (
        <WearBar compound={car.compound} age={car.tyreAge} spec={spec} />
      ) : (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>
          {car.compound}
        </span>
      )}
    </motion.div>
  )
}

export function TimingTower() {
  const raceState = useRaceStore(s => s.raceState)
  const config = useRaceStore(s => s.config)
  const prevGapRef = useRef<Map<string, number>>(new Map())

  if (!raceState || !config) return null

  const leader = raceState.cars.find(c => c.position === 1)
  const leaderTime = leader?.raceTime ?? 0
  const sorted = [...raceState.cars].sort((a, b) => a.position - b.position)

  return (
    <div style={{
      background: 'var(--bg-panel)', borderRadius: 8,
      width: '100%', border: '1px solid var(--line-hair)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '6px 10px 6px',
        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
        color: 'var(--text-dim)', letterSpacing: '0.12em',
        borderBottom: '1px solid var(--line-hair)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>TOWER</span>
        <span style={{ color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
          L{raceState.lap + 1}/{raceState.totalLaps}
        </span>
      </div>
      <AnimatePresence initial={false}>
        {sorted.map(car => (
          <TowerRow
            key={car.driverId}
            car={car}
            leaderTime={leaderTime}
            prevGapRef={prevGapRef}
            compounds={config.compounds}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
