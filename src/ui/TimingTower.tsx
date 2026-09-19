import { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'
import type { CarState, Compound, CompoundSpec } from '@engine/types'
import { useUiTap } from '@hooks/useUiTap'
import { useSafetyCarDeployCount } from '@hooks/useSafetyCar'

// Default compact view targets a fixed row count centred on the player (not a
// fixed radius) so a P1 or P20 player still gets a full-looking window instead
// of 2-3 rows adrift in empty space. Full field is one tap away, not gone.
const COMPACT_WINDOW_SIZE = 6

// Literal hex, not CSS var() — these get alpha suffixes concatenated on
// below (glow), which only works with a real hex string.
const COMPOUND_COLORS: Record<Compound, string> = {
  S: '#E8344E',
  M: '#F2C94C',
  H: '#EAEAEA',
  I: '#39B54A',
  W: '#4DA6FF',
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
          background: `linear-gradient(90deg, ${color}99 0%, ${color} 100%)`,
          boxShadow: fraction >= 0.55 ? `0 0 4px ${color}` : 'none',
          transition: 'width 0.5s ease, box-shadow 0.5s ease',
        }} />
      </div>
    </div>
  )
}

function TowerRow({ car, leaderTime, compounds, driverFlag, displayName, teamColor, wide, compressed }: {
  car: CarState
  leaderTime: number
  compounds: Record<string, CompoundSpec>
  driverFlag?: string
  displayName?: string
  teamColor?: string
  wide?: boolean
  compressed?: boolean
}) {
  const gap = car.raceTime - leaderTime
  const spec = compounds[car.compound]
  const driverCode = displayName ?? car.driverId.replace('d_', '').toUpperCase().slice(0, 3)

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
  // The compression flash wins over the player highlight for its ~1.2s: the
  // field collapsing is the more urgent thing to communicate, and the row
  // returns to its normal state immediately after.
  // --caution at 22%, via its channel token. NOT color-mix(): that needs
  // Chromium 111 (2023) and android/variables.gradle sets minSdkVersion 30, so
  // on an un-updated WebView the declaration is simply dropped and the flash
  // would silently not exist on exactly the low-end devices this project
  // targets. rgba(var(--x-rgb), a) has none of that problem and, unlike the
  // literal that used to sit here under a "keep in sync" comment, cannot drift
  // from the token.
  const rowBg = compressed
    ? 'rgba(var(--caution-rgb), 0.22)'
    : car.isPlayer
    ? fresh
      ? 'rgba(0,229,208,0.14)'
      : 'rgba(0,229,208,0.07)'
    : 'transparent'
  const nameColor = car.retired ? 'var(--text-dim)' : (car.isPlayer ? 'var(--accent)' : 'var(--text-hi)')

  return (
    <motion.div
      layout
      layoutId={car.driverId}
      data-tower-row
      transition={{ type: 'spring', stiffness: 450, damping: 38 }}
      style={{
        display: 'grid',
        gridTemplateColumns: wide ? '18px 1fr 46px 44px' : '18px 54px 1fr 44px',
        alignItems: 'center',
        gap: 4,
        padding: '5px 10px',
        background: rowBg,
        borderLeft: car.isPlayer ? '2px solid var(--accent)' : `2px solid ${teamColor ? teamColor + '44' : 'transparent'}`,
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
        color: nameColor, letterSpacing: '0.04em', opacity: car.retired ? 0.6 : 1,
        display: 'flex', alignItems: 'center', gap: 4, minWidth: 0,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: car.retired ? 'var(--text-dim)' : (car.isPlayer ? 'var(--accent)' : (teamColor ?? 'var(--text-dim)')),
        }} />
        {driverFlag && <span style={{ fontSize: 9, lineHeight: 1, flexShrink: 0 }}>{driverFlag}</span>}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{driverCode}</span>
      </span>
      {car.retired ? (
        <>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-warm)',
            letterSpacing: '0.06em', fontWeight: 700,
          }}>
            DNF
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>
            OUT
          </span>
        </>
      ) : (
        <>
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
        </>
      )}
    </motion.div>
  )
}

function GhostRow({ position, code, wide }: { position: number; code: string; wide?: boolean }) {
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
        gridTemplateColumns: wide ? '18px 1fr 46px 44px' : '18px 54px 1fr 44px',
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
      <span style={{
        fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
      }}>
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
  // Full field is the default — "not just top few" per feedback; NEARBY
  // remains one tap away for players who prefer a tighter battle context.
  const [expanded, setExpanded] = useState(true)
  const nameFormat = useSettingsStore(s => s.driverNameFormat)
  const setDriverNameFormat = useSettingsStore(s => s.setDriverNameFormat)
  const uiTap = useUiTap()
  const deployCount = useSafetyCarDeployCount()
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const [compressing, setCompressing] = useState(false)

  // One-shot flash on deployment. Spec section 6 surface 4: the compression is
  // the most dramatic reorder in the game, and the FLIP layout animation alone
  // does not explain WHY twenty rows moved at once.
  useEffect(() => {
    // Clearing FIRST is load-bearing, not defensive tidying. If reducedMotion
    // is switched on while a flash is mid-flight, the effect re-runs, the
    // cleanup below cancels the pending timer, and the early return would then
    // leave `compressing` stuck true forever -- a permanent tint over every
    // row, which is precisely the unreadable-tower failure this flash's own
    // test warns about. Reached only via the settings toggle mid-race.
    if (deployCount === 0 || reducedMotion) {
      setCompressing(false)
      return
    }
    setCompressing(true)
    const t = setTimeout(() => setCompressing(false), 1200)
    return () => clearTimeout(t)
  }, [deployCount, reducedMotion])

  if (!raceState || !config) return null

  const wide = nameFormat === 'full'
  const driverMap = new Map(config.drivers.map(d => [d.id, d]))
  const teamColorMap = new Map(config.teams.map(t => [t.id, t.colorPrimary]))
  const leaderTime = raceState.cars.find(c => c.position === 1)?.raceTime ?? 0
  const player = raceState.cars.find(c => c.isPlayer)
  const sorted = [...raceState.cars].sort((a, b) => a.position - b.position)
  const totalCars = sorted.length

  const ghostPos = pitPanelOpen && projectionResult ? projectionResult.rejoinPosition : null
  const playerDriver = player ? driverMap.get(player.driverId) : undefined
  const playerCode = wide ? (playerDriver?.name ?? 'Player') : (playerDriver?.code ?? 'PLY')

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
      background: 'var(--bg-elevated)', borderRadius: 10,
      width: '100%', height: '100%', border: '1px solid var(--line-hair)',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '7px 10px 5px',
        borderBottom: '1px solid var(--line-hair)', flexShrink: 0,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
          color: 'var(--accent)', letterSpacing: '0.14em',
        }}>
          RACE LEADERBOARD
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
          color: 'var(--text-mid)', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.06em',
        }}>
          L{raceState.lap + 1}/{raceState.totalLaps}
        </span>
      </div>
      <div style={{
        display: 'flex', gap: 6, padding: '4px 8px',
        borderBottom: '1px solid var(--line-hair)', flexShrink: 0,
      }}>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => { uiTap(); setExpanded(v => !v) }}
          style={{
            flex: 1, padding: '5px 8px', borderRadius: 6,
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
            color: expanded ? 'var(--bg-deep)' : 'var(--text-dim)',
            background: expanded ? 'var(--accent)' : 'var(--bg-elevated)',
            border: expanded ? 'none' : '1px solid var(--line-hair)',
            cursor: 'pointer',
          }}
        >
          {expanded ? `FULL FIELD (${totalCars})` : 'NEARBY ▾'}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => { uiTap(); setDriverNameFormat(wide ? 'code' : 'full') }}
          style={{
            padding: '5px 10px', borderRadius: 6,
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
            color: 'var(--text-dim)', background: 'var(--bg-elevated)',
            border: '1px solid var(--line-hair)', cursor: 'pointer', flexShrink: 0,
          }}
          title="Toggle full name / code"
        >
          {wide ? 'ABC' : 'FULL NAME'}
        </motion.button>
      </div>
      <div style={{
        flex: 1, overflowY: expanded ? 'auto' : 'hidden', minHeight: 0,
        display: 'flex', flexDirection: 'column',
        justifyContent: expanded ? 'flex-start' : 'center',
      }}>
        <AnimatePresence initial={false}>
          {rows.map((row) =>
            row.type === 'ghost' ? (
              <GhostRow key="ghost-player" position={ghostPos!} code={playerCode} wide={wide} />
            ) : (
              <TowerRow
                key={row.car.driverId}
                car={row.car}
                leaderTime={leaderTime}
                compounds={config.compounds}
                driverFlag={(driverMap.get(row.car.driverId) as { flag?: string } | undefined)?.flag}
                displayName={wide ? driverMap.get(row.car.driverId)?.name : driverMap.get(row.car.driverId)?.code}
                teamColor={teamColorMap.get(row.car.teamId)}
                wide={wide}
                compressed={compressing}
              />
            )
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
