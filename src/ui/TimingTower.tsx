import { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'
import type { CarState } from '@engine/types'
import { TyreChip, PRESS } from '@ui/kit'
import { useUiTap } from '@hooks/useUiTap'
import { useSafetyCarDeployCount } from '@hooks/useSafetyCar'

// Default compact view targets a fixed row count centred on the player (not a
// fixed radius) so a P1 or P20 player still gets a full-looking window instead
// of 2-3 rows adrift in empty space. Full field is one tap away, not gone.
const COMPACT_WINDOW_SIZE = 6

// Race Day Bold row grid (spec §6): position | team slash | code | gap | tyre.
// Full-name mode trades the fixed code column for the flexible one.
const GRID = '26px 5px 46px 1fr 30px'
const GRID_WIDE = '26px 5px minmax(0, 1fr) 56px 30px'
const ROW_SPRING = { type: 'spring', stiffness: 450, damping: 38 } as const

function formatGap(gap: number, position: number): string {
  if (position === 1) return 'LEAD'
  return `+${gap.toFixed(1)}`
}

function TowerRow({ car, leaderTime, displayName, teamColor, wide, compressed }: {
  car: CarState
  leaderTime: number
  displayName?: string
  teamColor?: string
  wide?: boolean
  compressed?: boolean
}) {
  const gap = car.raceTime - leaderTime
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
    // A retired player drops the volt: its dim retired styling would be
    // unreadable on yellow.
    : car.isPlayer && !car.retired
    ? fresh
      // Fresh-tyre shimmer: the volt row washes out toward its right edge
      // for 1.8s after a stop, then settles back to solid volt.
      ? 'linear-gradient(90deg, var(--volt) 40%, rgba(var(--volt-rgb), 0.55) 100%)'
      : 'var(--volt)'
    : 'var(--grape)'
  const onVolt = car.isPlayer && !car.retired && !compressed
  const textColor = car.retired ? 'var(--lilac-dim)' : onVolt ? 'var(--ink)' : 'var(--white)'

  return (
    <motion.div
      layout
      layoutId={car.driverId}
      data-tower-row
      className="slant-row"
      transition={ROW_SPRING}
      style={{
        display: 'grid',
        gridTemplateColumns: wide ? GRID_WIDE : GRID,
        alignItems: 'center',
        columnGap: 6,
        height: car.isPlayer ? 46 : 36,
        padding: '0 12px',
        flexShrink: 0,
        background: rowBg,
        // Retired rows dim through text colour, not opacity: --lilac-dim name,
        // --hot DNF/OUT, both >= 4.5:1 on --grape (an opacity fade drops them below).
        color: textColor,
        transition: 'background 0.4s ease',
      }}
    >
      <span style={{
        fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 20,
        fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>
        {car.position}
      </span>
      <span aria-hidden="true" style={{
        width: 5, height: 20, transform: 'skewX(-14deg)',
        background: car.retired ? 'var(--lilac-dim)' : (teamColor ?? 'var(--lilac-dim)'),
      }} />
      <span style={{
        fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 15, letterSpacing: 0.5,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
      }}>
        {driverCode}
      </span>
      {car.retired ? (
        <>
          <span style={{ fontWeight: 700, fontSize: 14, textAlign: 'right', color: 'var(--hot)' }}>DNF</span>
          <span style={{ fontWeight: 700, fontSize: 11, textAlign: 'center', color: 'var(--hot)' }}>OUT</span>
        </>
      ) : (
        <>
          <span style={{
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14, textAlign: 'right',
            fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: 0,
          }}>
            {/* Colour is never the only signal (CLAUDE.md 6.3): the glyph carries direction. */}
            {flash && (
              <span
                role="img"
                aria-label={flash === 'gain' ? 'gained a place' : 'lost a place'}
                data-flash-glyph
                // On the volt row everything is ink (contrast); the glyph's
                // shape still carries the direction.
                style={{ color: onVolt ? 'var(--ink)' : flash === 'gain' ? 'var(--gain)' : 'var(--hot)', marginRight: 4 }}
              >
                {flash === 'gain' ? '▲' : '▼'}
              </span>
            )}
            {formatGap(gap, car.position)}
          </span>
          <span style={{
            display: 'inline-flex', justifySelf: 'center', borderRadius: 999,
            // On the volt row the chip sits on an ink disc so the compound
            // colour and white letter keep their contrast.
            background: onVolt ? 'var(--ink)' : 'transparent',
          }}>
            <TyreChip compound={car.compound} size={24} />
          </span>
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
      className="slant-row"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={ROW_SPRING}
      style={{
        display: 'grid',
        gridTemplateColumns: wide ? GRID_WIDE : GRID,
        alignItems: 'center',
        columnGap: 6,
        height: 36,
        padding: '0 12px',
        flexShrink: 0,
        background: 'rgba(var(--volt-rgb), 0.18)',
        color: 'var(--volt)',
      }}
    >
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 20, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {position}
      </span>
      <span aria-hidden="true" style={{ width: 5, height: 20, transform: 'skewX(-14deg)', background: 'var(--volt)' }} />
      <span style={{ fontWeight: 800, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {code}
      </span>
      <span style={{ fontWeight: 700, fontSize: 12, textAlign: 'right', letterSpacing: 1 }}>PIT→</span>
      <span />
    </motion.div>
  )
}

export function TimingTower() {
  const raceState = useRaceStore(s => s.raceState)
  const config = useRaceStore(s => s.config)
  const pitPanelOpen = useRaceStore(s => s.pitPanelOpen)
  const projectionResult = useRaceStore(s => s.projectionResult)
  // Compact (six rows around you) is the default per the Race Day Bold spec
  // §6; the full field is one tap away.
  const [expanded, setExpanded] = useState(false)
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
      background: 'var(--night)', width: '100%', height: '100%',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        padding: '0 12px', flexShrink: 0,
      }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 16,
          color: 'var(--white)', letterSpacing: 0.5,
        }}>
          LAP {raceState.lap + 1}<span style={{ color: 'var(--lilac-dim)' }}>/{raceState.totalLaps}</span>
        </span>
        <span style={{ display: 'flex', gap: 6 }}>
          <motion.button
            type="button"
            className="slant-sm kit-focus"
            whileTap={reducedMotion ? undefined : { scale: 0.96 }} transition={PRESS}
            onClick={() => { uiTap(); setExpanded(v => !v) }}
            style={{
              minHeight: 48, padding: '0 14px', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12, letterSpacing: 0.5,
              background: 'var(--grape)', color: 'var(--white)', whiteSpace: 'nowrap',
            }}
          >
            {expanded ? 'NEARBY ↑' : 'FULL FIELD ↓'}
          </motion.button>
          <motion.button
            type="button"
            className="slant-sm kit-focus"
            whileTap={reducedMotion ? undefined : { scale: 0.96 }} transition={PRESS}
            onClick={() => { uiTap(); setDriverNameFormat(wide ? 'code' : 'full') }}
            title="Toggle full name / code"
            style={{
              minHeight: 48, padding: '0 14px', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12, letterSpacing: 0.5,
              background: 'transparent', color: 'var(--lilac)', whiteSpace: 'nowrap',
            }}
          >
            {wide ? 'ABC' : 'FULL NAME'}
          </motion.button>
        </span>
      </div>
      <div style={{
        flex: 1, overflowY: expanded ? 'auto' : 'hidden', minHeight: 0,
        display: 'flex', flexDirection: 'column', gap: 3, padding: '2px 8px 8px',
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
