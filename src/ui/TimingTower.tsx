import { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import type { CarState, Compound, CompoundSpec } from '@engine/types'
import { useUiTap } from '@hooks/useUiTap'

// Default compact view targets a fixed row count centred on the player (not a
// fixed radius) so a P1 or P20 player still gets a full-looking window instead
// of 2-3 rows adrift in empty space. Full field is one tap away, not gone.
const COMPACT_WINDOW_SIZE = 6

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

function WearBar({ compound, age, spec, fresh }: { compound: Compound; age: number; spec: CompoundSpec; fresh?: boolean }) {
  const fraction = spec.cliff > 0 ? Math.min(age / spec.cliff, 1.2) : 0
  const fillPct = Math.min(fraction * 100, 100)
  const color = fraction >= 1.0
    ? '#FF4D5E'
    : fraction >= 0.55
    ? '#F2C94C'
    : '#3DDC84'
  const dotColor = COMPOUND_COLORS[compound]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: dotColor, flexShrink: 0,
        boxShadow: fresh ? `0 0 8px ${dotColor}, 0 0 14px ${dotColor}88` : fraction < 0.55 ? `0 0 4px ${dotColor}` : 'none',
        transition: 'box-shadow 1.2s ease',
      }} />
      <div style={{
        width: 32, height: 5, borderRadius: 2,
        background: '#0A0E1A', overflow: 'hidden', flexShrink: 0,
      }}>
        <div style={{
          height: '100%', borderRadius: 2,
          width: `${fillPct}%`,
          background: color,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  )
}

function TowerRow({ car, leaderTime, compounds, driverFlag, driverCode: codeOverride }: {
  car: CarState
  leaderTime: number
  compounds: Record<string, CompoundSpec>
  driverFlag?: string
  driverCode?: string
}) {
  const gap = car.raceTime - leaderTime
  const spec = compounds[car.compound]
  const driverCode = codeOverride ?? car.driverId.replace('d_', '').toUpperCase().slice(0, 3)

  const prevPosRef = useRef(car.position)
  const prevAgeRef = useRef(car.tyreAge)
  const [flash, setFlash] = useState<'gain' | 'loss' | null>(null)
  const [fresh, setFresh] = useState(false)

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

  // Fresh-tyre shimmer: fires when tyreAge resets to 0 after a pit stop
  useEffect(() => {
    if (car.tyreAge === 0 && prevAgeRef.current > 3) {
      setFresh(true)
      const t = setTimeout(() => setFresh(false), 1800)
      return () => clearTimeout(t)
    }
    prevAgeRef.current = car.tyreAge
  }, [car.tyreAge])

  const gapColor = car.position === 1 ? 'var(--text-dim)' : 'var(--text-mid)'
  const rowBg = car.isPlayer
    ? fresh
      ? 'rgba(0,229,208,0.14)'
      : 'rgba(0,229,208,0.07)'
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
        background: rowBg,
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
        display: 'flex', alignItems: 'center', gap: 3,
      }}>
        {driverFlag && <span style={{ fontSize: 9, lineHeight: 1 }}>{driverFlag}</span>}
        {driverCode}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, color: gapColor,
        fontVariantNumeric: 'tabular-nums', minWidth: 0,
      }}>
        {formatGap(gap, car.position)}
      </span>
      {spec ? (
        <WearBar compound={car.compound} age={car.tyreAge} spec={spec} fresh={fresh && car.isPlayer} />
      ) : (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>
          {car.compound}
        </span>
      )}
    </motion.div>
  )
}

function GhostRow({ position, code }: { position: number; code: string }) {
  return (
    <motion.div
      layout
      layoutId="ghost-player"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ type: 'spring', stiffness: 450, damping: 38 }}
      style={{
        display: 'grid',
        gridTemplateColumns: '18px 32px 1fr 44px',
        alignItems: 'center',
        gap: 4,
        padding: '5px 10px',
        background: 'rgba(0,229,208,0.04)',
        borderLeft: '2px dashed var(--accent)',
        borderBottom: '0.5px solid #141a2b',
        opacity: 0.55,
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
        {position}
      </span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em' }}>
        {code}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.05em' }}>
        PIT→
      </span>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: 'var(--accent)', alignSelf: 'center',
        boxShadow: '0 0 6px var(--accent)',
      }} />
    </motion.div>
  )
}

export function TimingTower() {
  const raceState = useRaceStore(s => s.raceState)
  const config = useRaceStore(s => s.config)
  const pitPanelOpen = useRaceStore(s => s.pitPanelOpen)
  const projectionResult = useRaceStore(s => s.projectionResult)
  const [expanded, setExpanded] = useState(false)
  const uiTap = useUiTap()

  if (!raceState || !config) return null

  const driverMap = new Map(config.drivers.map(d => [d.id, d]))
  const leaderTime = raceState.cars.find(c => c.position === 1)?.raceTime ?? 0
  const player = raceState.cars.find(c => c.isPlayer)
  const sorted = [...raceState.cars].sort((a, b) => a.position - b.position)
  const totalCars = sorted.length

  const ghostPos = pitPanelOpen && projectionResult ? projectionResult.rejoinPosition : null
  const playerCode = player ? (driverMap.get(player.driverId)?.code ?? 'PLY') : 'PLY'

  // Compact default: a fixed-size window of nearby rivals centred on the
  // player, clamped to the field so a P1 or P20 player still fills the window
  // instead of trailing off into empty space near an edge.
  let visibleCars = sorted
  if (!expanded && player && totalCars > COMPACT_WINDOW_SIZE) {
    let start = player.position - Math.floor(COMPACT_WINDOW_SIZE / 2)
    let end = start + COMPACT_WINDOW_SIZE - 1
    if (start < 1) { start = 1; end = COMPACT_WINDOW_SIZE }
    if (end > totalCars) { end = totalCars; start = totalCars - COMPACT_WINDOW_SIZE + 1 }
    visibleCars = sorted.filter(c => c.position >= start && c.position <= end)
  }

  // Build display list with ghost at projected position, real player row hidden
  type Row = { type: 'real'; car: typeof sorted[0] } | { type: 'ghost' }
  const rows: Row[] = []
  if (ghostPos != null) {
    let ghostInserted = false
    for (const car of visibleCars) {
      if (car.isPlayer) continue
      if (!ghostInserted && car.position >= ghostPos) {
        rows.push({ type: 'ghost' })
        ghostInserted = true
      }
      rows.push({ type: 'real', car })
    }
    if (!ghostInserted) rows.push({ type: 'ghost' })
  } else {
    visibleCars.forEach(car => rows.push({ type: 'real', car }))
  }

  return (
    <div style={{
      background: 'var(--bg-panel)', borderRadius: 8,
      width: '100%', height: '100%', border: '1px solid var(--line-hair)',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <motion.button
        whileTap={{ scale: 0.99 }}
        onClick={() => { uiTap(); setExpanded(v => !v) }}
        style={{
          padding: '6px 10px 6px',
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
          color: 'var(--text-dim)', letterSpacing: '0.12em',
          borderBottom: '1px solid var(--line-hair)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0,
          width: '100%',
        }}
      >
        <span>{expanded ? 'FULL FIELD ▴' : `NEARBY ▾ (${totalCars})`}</span>
        <span style={{ color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
          L{raceState.lap + 1}/{raceState.totalLaps}
        </span>
      </motion.button>
      <div style={{
        flex: 1, overflowY: expanded ? 'auto' : 'hidden', minHeight: 0,
        display: 'flex', flexDirection: 'column',
        justifyContent: expanded ? 'flex-start' : 'center',
      }}>
        <AnimatePresence initial={false}>
          {rows.map((row) =>
            row.type === 'ghost' ? (
              <GhostRow key="ghost-player" position={ghostPos!} code={playerCode} />
            ) : (
              <TowerRow
                key={row.car.driverId}
                car={row.car}
                leaderTime={leaderTime}
                compounds={config.compounds}
                driverFlag={(driverMap.get(row.car.driverId) as { flag?: string } | undefined)?.flag}
                driverCode={driverMap.get(row.car.driverId)?.code}
              />
            )
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
