import { useRef, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'
import type { CarState, RaceState } from '@engine/types'
import { effectiveOrder } from '@engine/penalties'
import { TyreChip, PRESS, EASE, snapIn } from '@ui/kit'
import { useUiTap } from '@hooks/useUiTap'
import { useSafetyCarDeployCount } from '@hooks/useSafetyCar'
import { rivalIntel } from '@engine/rivalIntel'
import { RivalIntelCard, intelAriaLabel } from './RivalIntelCard'
import { towerV2, type TowerV2Row } from '@state/towerV2'

// Default compact view targets a fixed row count centred on the player (not a
// fixed radius) so a P1 or P20 player still gets a full-looking window instead
// of 2-3 rows adrift in empty space. Full field is one tap away, not gone.
const COMPACT_WINDOW_SIZE = 6

/** Large text zooms the tower 1.15x, so the compact window drops one row to keep the bottom row whole. */
export function compactWindowSize(textSize: 'standard' | 'large'): number {
  return textSize === 'large' ? COMPACT_WINDOW_SIZE - 1 : COMPACT_WINDOW_SIZE
}

// Race Day Bold row grid (spec §6): position | team slash | code | gap | tyre.
// Full-name mode trades the fixed code column for the flexible one.
const GRID = '26px 5px 46px 1fr 30px'
const GRID_WIDE = '26px 5px minmax(0, 1fr) 56px 30px'
const ROW_SPRING = { duration: 0.22, ease: EASE } as const
// Row geometry, shared with the DRS-train bracket overlay (which spans rows).
const ROW_H = 36
const PLAYER_ROW_H = 46
const ROW_GAP = 3
const LIST_PAD_TOP = 2

/**
 * One continuous DRS-train bracket per run of consecutive displayed rows in
 * the same train (spec §3.4). Geometry comes from the fixed row heights, so
 * the bracket spans the 3 px gaps between rows instead of breaking at each.
 * A ghost row, a retired row or a different train ends a run. Keyed by the
 * run's first car so a train gaining/losing cars at the back animates in place.
 */
export function trainBracketSegments(
  rows: ReadonlyArray<{ type: 'ghost' } | { type: 'real'; car: Pick<CarState, 'driverId' | 'isPlayer' | 'retired'> }>,
  v2: ReadonlyMap<string, TowerV2Row> | null,
): { key: string; top: number; height: number }[] {
  const out: { key: string; top: number; height: number; train: number }[] = []
  let y = LIST_PAD_TOP
  let prevTrain: number | null = null
  for (const row of rows) {
    const h = row.type === 'real' && row.car.isPlayer ? PLAYER_ROW_H : ROW_H
    const t = row.type === 'real' && !row.car.retired ? v2?.get(row.car.driverId)?.train ?? null : null
    if (t && prevTrain === t.index && out.length > 0) out[out.length - 1]!.height = y + h - out[out.length - 1]!.top
    // A lone visible row of a train (the rest windowed off) still gets its bar.
    else if (t && row.type === 'real') out.push({ key: `train-${row.car.driverId}`, top: y, height: h, train: t.index })
    prevTrain = t ? t.index : null
    y += h + ROW_GAP
  }
  return out.map(({ key, top, height }) => ({ key, top, height }))
}

/** The bracket bar: grows/shrinks with the rows' FLIP timing; opacity only when reduced. */
function TrainBracket({ top, height, reduced }: { top: number; height: number; reduced: boolean }) {
  const inset = 5   // past the slant clip at a row's top and bottom edge
  return (
    <motion.span
      aria-hidden="true"
      data-train-bracket
      initial={reduced ? { opacity: 0, top: top + inset, height: height - 2 * inset } : { opacity: 0, top: top + inset, height: 0 }}
      animate={{ opacity: 1, top: top + inset, height: height - 2 * inset }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
      transition={reduced ? { duration: 0.12, top: { duration: 0 }, height: { duration: 0 } } : ROW_SPRING}
      style={{
        position: 'absolute', left: 8 + 6, width: 3, borderRadius: 2,
        background: 'var(--dusk)', pointerEvents: 'none', zIndex: 1,
      }}
    />
  )
}

function formatGap(gap: number, position: number): string {
  if (position === 1) return 'LEAD'
  return `+${gap.toFixed(1)}`
}

/** Spoken suffix for the 2.0 facts; '' when DRS is off, so 1.9 rows are unchanged. */
function v2AriaSuffix(v2: TowerV2Row | undefined): string {
  if (!v2) return ''
  let s = ''
  if (v2.drs === 'open') s += ', DRS open'
  else if (v2.drs === 'neutralised') s += ', DRS neutralised'
  if (v2.train) s += `, in a DRS train of ${v2.train.size}`
  if (v2.penaltySec > 0) s += `, ${v2.penaltySec} second penalty pending`
  if (v2.coldTyres) s += ', cold tyres'
  return s
}

// Compact pill sized for a 36px tower row (the kit Pill is a 13px/7px control
// chip, too tall here). Text carries the state; colour only reinforces it.
const DRS_PILL = {
  display: 'inline-block', marginRight: 6, padding: '1px 5px', borderRadius: 999,
  fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 10, letterSpacing: 0.5,
  lineHeight: '14px', verticalAlign: 'middle',
} as const

/** The player's road position and where they would classify with pending penalties added (spec §8.3). Null when none is pending. */
export function playerEffectivePosition(state: RaceState): { road: number; after: number } | null {
  const me = state.cars.find(c => c.isPlayer)
  if (!me || me.retired || !(me.penalty && me.penalty.pendingSec > 0)) return null
  return { road: me.position, after: effectiveOrder(state).findIndex(c => c.isPlayer) + 1 }
}

/** A pending time penalty: hot fill, ink text; the "+5" itself is the signal, not the colour. */
function PenaltyChip({ sec, onVolt }: { sec: number; onVolt: boolean }) {
  return (
    <span data-penalty-chip aria-hidden="true" style={{
      ...DRS_PILL, borderRadius: 0, background: 'var(--hot)', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums',
      boxShadow: onVolt ? 'inset 0 0 0 1px var(--ink)' : undefined,
    }}>+{sec}</span>
  )
}

function DrsPill({ state, onVolt }: { state: 'open' | 'neutralised'; onVolt: boolean }) {
  if (state === 'open') {
    return <span data-drs-pill="open" style={{ ...DRS_PILL, background: onVolt ? 'var(--ink)' : 'var(--gain)', color: onVolt ? 'var(--gain)' : 'var(--ink)' }}>DRS</span>
  }
  return (
    <span data-drs-pill="neutralised" title="Neutralised — the car ahead has DRS too" style={{
      ...DRS_PILL, color: onVolt ? 'var(--ink)' : 'var(--lilac-dim)',
      boxShadow: `inset 0 0 0 1px ${onVolt ? 'var(--ink)' : 'var(--lilac-dim)'}`,
    }}>DRS ✕</span>
  )
}

function TowerRow({ car, leaderTime, displayName, teamColor, wide, compressed, intel, v2 }: {
  car: CarState
  leaderTime: number
  displayName?: string
  teamColor?: string
  wide?: boolean
  compressed?: boolean
  /** Present on rival rows only: the row becomes a button that opens the intel card. */
  intel?: { label: string; selected: boolean; onSelect: () => void; onClose: () => void }
  /** 2.0 facts (DRS, train); all-null while DRS is disabled. */
  v2?: TowerV2Row
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
  const v2Suffix = car.retired ? '' : v2AriaSuffix(v2)
  const train = car.retired ? null : v2?.train ?? null
  const drs = car.retired ? null : v2?.drs ?? null
  const penaltySec = car.retired ? 0 : v2?.penaltySec ?? 0
  const coldTyres = !car.retired && (v2?.coldTyres ?? false)
  // Non-intel rows get a label only when there is a 2.0 fact to speak.
  const rowLabel = intel ? intel.label + v2Suffix
    : v2Suffix ? `P${car.position} ${driverCode} ${formatGap(gap, car.position)}${v2Suffix}` : undefined

  return (
    <motion.div
      layout
      layoutId={car.driverId}
      data-tower-row
      data-testid="tower-row"
      data-intel-row={intel ? car.driverId : undefined}
      className={intel ? 'slant-row kit-focus' : 'slant-row'}
      transition={ROW_SPRING}
      role={intel ? 'button' : rowLabel ? 'group' : undefined}
      tabIndex={intel ? 0 : undefined}
      aria-label={rowLabel}
      aria-expanded={intel ? intel.selected : undefined}
      data-selected={intel?.selected ? 'true' : undefined}
      onClick={intel?.onSelect}
      onKeyDown={intel ? (e) => {
        if (e.key === 'Escape') { if (intel.selected) { e.preventDefault(); intel.onClose() } return }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) intel.onSelect() }
      } : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: wide ? GRID_WIDE : GRID,
        alignItems: 'center',
        columnGap: 6,
        height: car.isPlayer ? PLAYER_ROW_H : ROW_H,
        padding: '0 12px',
        flexShrink: 0,
        background: rowBg,
        // Retired rows dim through text colour, not opacity: --lilac-dim name,
        // --hot DNF/OUT, both >= 4.5:1 on --grape (an opacity fade drops them below).
        color: textColor,
        transition: 'background 0.4s ease',
        cursor: intel ? 'pointer' : undefined,
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
            {/* The head never has DRS (nobody within range ahead), so its gap
                cell has room for the train label; the 46px code column does not. */}
            {train?.first && (
              <span style={{
                marginRight: 6, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: 0.5,
                color: onVolt ? 'var(--ink)' : 'var(--lilac-dim)', verticalAlign: 'middle',
              }}>TRAIN ×{train.size}</span>
            )}
            {/* 2.1: a fresh set still below its window. The word is the signal; the row label speaks it. */}
            {coldTyres && (
              <span data-cold-tag aria-hidden="true" style={{
                marginRight: 6, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, letterSpacing: 0.5,
                color: onVolt ? 'var(--ink)' : 'var(--caution)', verticalAlign: 'middle',
              }}>COLD</span>
            )}
            {penaltySec > 0 && <PenaltyChip sec={penaltySec} onVolt={onVolt} />}
            {drs && <DrsPill state={drs} onVolt={onVolt} />}
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
  const phase = useRaceStore(s => s.phase)
  const pitPanelOpen = useRaceStore(s => s.pitPanelOpen)
  const projectionResult = useRaceStore(s => s.projectionResult)
  // Compact (six rows around you) is the default per the Race Day Bold spec
  // §6; the full field is one tap away.
  const [expanded, setExpanded] = useState(false)
  const nameFormat = useSettingsStore(s => s.driverNameFormat)
  const textSize = useSettingsStore(s => s.textSize)
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

  // The rival whose intel card is open, by driverId, so the card follows the
  // car through position changes and out of the compact window.
  const [intelId, setIntelId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  // A tap anywhere outside the tower closes the card. The race keeps running.
  useEffect(() => {
    if (intelId === null) return
    const onDown = (e: Event) => {
      const root = rootRef.current
      if (root && e.target instanceof Node && root.contains(e.target)) return
      setIntelId(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [intelId])

  // Intel inputs move only at lap boundaries (see rivalIntel.ts), plus a stop
  // or a retirement, so the labels and the open card's intel are memoised on
  // the lap and a cheap signature of those. Sector ticks do not recompute
  // them; the row prop objects below are still rebuilt each render.
  const lap = raceState?.lap
  const sig = raceState ? raceState.cars.map(c => `${c.retired ? 1 : 0}${c.pitsDone}${c.compound}`).join() : ''
  const labels = useMemo(() => {
    const m = new Map<string, string>()
    if (!raceState || !config) return m
    for (const car of raceState.cars) {
      if (car.isPlayer) continue
      const info = rivalIntel(config, raceState, car.driverId)
      if (info) m.set(car.driverId, intelAriaLabel(info, config.drivers.find(d => d.id === car.driverId)?.code ?? car.driverId))
    }
    return m
    // raceState is deliberately keyed by lap + sig, not identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, lap, sig])
  const openIntel = useMemo(
    () => (intelId && raceState && config ? rivalIntel(config, raceState, intelId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, lap, sig, intelId])
  // 2.0 facts, derived once per race state (not per row, not per frame).
  const v2 = useMemo(() => (config && raceState ? towerV2(config, raceState) : null), [config, raceState])
  const effective = useMemo(() => {
    const e = raceState ? playerEffectivePosition(raceState) : null
    const sec = raceState?.cars.find(c => c.isPlayer)?.penalty?.pendingSec ?? 0
    return e ? { ...e, sec } : null
  }, [raceState])
  const select = (id: string) => { uiTap(); setIntelId(cur => (cur === id ? null : id)) }
  // The flag closes the card.
  useEffect(() => { if (phase === 'finished') setIntelId(null) }, [phase])

  if (!raceState || !config) return null

  const wide = nameFormat === 'full'
  const driverMap = new Map(config.drivers.map(d => [d.id, d]))
  const teamColorMap = new Map(config.teams.map(t => [t.id, t.colorPrimary]))
  const leaderTime = raceState.cars.find(c => c.position === 1)?.raceTime ?? 0
  const player = raceState.cars.find(c => c.isPlayer)
  const sorted = [...raceState.cars].sort((a, b) => a.position - b.position)
  const totalCars = sorted.length

  const openCar = intelId ? raceState.cars.find(c => c.driverId === intelId) : undefined
  const ghostPos = pitPanelOpen && projectionResult ? projectionResult.rejoinPosition : null
  const playerDriver = player ? driverMap.get(player.driverId) : undefined
  const playerCode = wide ? (playerDriver?.name ?? 'Player') : (playerDriver?.code ?? 'PLY')

  // Compact default: a fixed-size window of nearby rivals centred on the
  // player, clamped to the field so a P1 or P20 player still fills the window
  // instead of trailing off into empty space near an edge.
  const windowSize = compactWindowSize(textSize)
  let visibleCars = sorted
  if (!expanded && player && totalCars > windowSize) {
    let start = player.position - Math.floor(windowSize / 2)
    let end = start + windowSize - 1
    if (start < 1) { start = 1; end = windowSize }
    if (end > totalCars) { end = totalCars; start = totalCars - windowSize + 1 }
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
    <div ref={rootRef} className="text-zoom" style={{
      background: 'var(--night)', width: '100%', height: '100%',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
        padding: '0 12px', flexShrink: 0,
      }}>
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
        display: 'flex', flexDirection: 'column', gap: ROW_GAP, padding: `${LIST_PAD_TOP}px 8px 8px`,
        justifyContent: 'flex-start', position: 'relative',
      }}>
        {/* DRS-train brackets: absolutely placed over the rows so one bar spans
            the whole train; nothing renders while DRS is off (no train facts).
            Accepted caveats: geometry is from the current rows only, so an
            exiting ghost row (0.22 s exit) or rows entering/exiting when the
            compact window shifts can make the bar lead the rows briefly. */}
        <AnimatePresence initial={false}>
          {trainBracketSegments(rows, v2 ?? null).map(seg => (
            <TrainBracket key={seg.key} top={seg.top} height={seg.height} reduced={reducedMotion} />
          ))}
        </AnimatePresence>
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
                v2={v2?.get(row.car.driverId)}
                intel={labels.has(row.car.driverId) ? {
                  label: labels.get(row.car.driverId)!,
                  selected: intelId === row.car.driverId,
                  onSelect: () => select(row.car.driverId),
                  onClose: () => setIntelId(null),
                } : undefined}
              />
            )
          )}
        </AnimatePresence>
      </div>
      {effective && (
        <div data-testid="penalty-readout" role="status" style={{
          flexShrink: 0, padding: '4px 12px 6px', fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12,
          letterSpacing: 0.5, color: 'var(--lilac)', fontVariantNumeric: 'tabular-nums',
        }}>
          P{effective.road}{' '}
          <span style={{ color: effective.after > effective.road ? 'var(--hot)' : 'var(--lilac)' }}>
            {effective.after > effective.road ? '▼' : '▸'} P{effective.after}
          </span>{' '}
          after +{effective.sec}s
        </div>
      )}
      <AnimatePresence initial={false}>
        {openIntel && openCar && (
          <motion.div key="rival-intel" {...snapIn(reducedMotion)} style={{ flexShrink: 0, padding: '0 8px 8px' }}>
            <RivalIntelCard
              intel={openIntel}
              code={driverMap.get(openCar.driverId)?.code ?? openCar.driverId}
              teamColor={teamColorMap.get(openCar.teamId) ?? 'var(--lilac-dim)'}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
