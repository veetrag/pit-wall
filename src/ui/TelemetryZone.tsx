import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { tyreCliffFraction, effectiveTyreAge } from '@engine/index'

const COMPOUND_COLORS: Record<string, string> = {
  S: '#E8344E',
  M: '#F2C94C',
  H: '#EAEAEA',
  I: '#39B54A',
  W: '#4DA6FF',
}

function gaugeColor(fraction: number): string {
  if (fraction >= 1.0) return '#FF4D5E'
  if (fraction >= 0.55) return '#F2C94C'
  return '#3DDC84'
}

/** Radial SVG tyre gauge */
function TyreGaugeRadial({ fraction, compound, tyreAge }: {
  fraction: number
  compound: string
  tyreAge: number
}) {
  const size = 110
  const cx = size / 2
  const cy = size / 2
  const r = 42
  const strokeW = 8

  // Arc from 225° to -45° (270° sweep)
  const startAngle = 225
  const sweepAngle = 270
  const filled = Math.min(fraction, 1.0) * sweepAngle

  function polarToXY(angleDeg: number, radius: number): [number, number] {
    const rad = (angleDeg * Math.PI) / 180
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)]
  }

  function arcPath(startDeg: number, endDeg: number, radius: number): string {
    const [sx, sy] = polarToXY(startDeg, radius)
    const [ex, ey] = polarToXY(endDeg, radius)
    const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0
    return `M ${sx} ${sy} A ${radius} ${radius} 0 ${large} 1 ${ex} ${ey}`
  }

  const trackEnd = startAngle + sweepAngle // = 495 = 135 deg (same as -225)
  const fillEnd  = startAngle + filled

  const color = gaugeColor(fraction)
  const compColor = COMPOUND_COLORS[compound] ?? '#9AA7C7'
  const shouldPulse = fraction >= 0.80

  return (
    <motion.div
      animate={shouldPulse ? { opacity: [1, 0.7, 1] } : { opacity: 1 }}
      transition={shouldPulse ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } : {}}
      style={{
        width: size, height: size, flexShrink: 0,
        // Soft colour wash behind the gauge — reads as "live" without adding
        // a new visual element; intensity tracks the same wear-state color
        // driving the arc, so nothing here is decoration.
        background: `radial-gradient(circle, ${color}1a 0%, transparent 65%)`,
        borderRadius: '50%',
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track arc */}
        <path
          d={arcPath(startAngle, trackEnd, r)}
          fill="none"
          stroke="#1B2238"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
        {/* Fill arc */}
        {filled > 0 && (
          <path
            d={arcPath(startAngle, fillEnd, r)}
            fill="none"
            stroke={color}
            strokeWidth={strokeW}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 5px ${color}99)` }}
          />
        )}
        {/* Compound letter */}
        <text
          x={cx} y={cy - 6}
          textAnchor="middle" dominantBaseline="middle"
          fill={compColor}
          fontFamily="var(--font-mono)"
          fontSize={22} fontWeight={700}
        >
          {compound}
        </text>
        {/* Worn label */}
        <text
          x={cx} y={cy + 12}
          textAnchor="middle" dominantBaseline="middle"
          fill={color}
          fontFamily="var(--font-mono)"
          fontSize={9}
        >
          {Math.round(Math.min(fraction, 1.0) * 100)}% worn
        </text>
        {/* Stint age */}
        <text
          x={cx} y={cy + 24}
          textAnchor="middle" dominantBaseline="middle"
          fill="var(--text-dim)"
          fontFamily="var(--font-mono)"
          fontSize={8}
        >
          L{tyreAge} stint
        </text>
      </svg>
    </motion.div>
  )
}

// Shared stat-card chrome: a soft colour wash bleeding in from the accent
// border (same colour driving the gauge/urgency state) instead of a flat
// panel fill — gives each card a little life without adding new elements.
// `critical` adds a slow breathing glow, reserved for the one card that
// actually needs urgency (never more than one at a time).
function StatCard({ accent, critical, children }: { accent: string; critical?: boolean; children: ReactNode }) {
  return (
    <motion.div
      animate={critical ? { boxShadow: [`0 0 0px ${accent}00`, `0 0 10px ${accent}55`, `0 0 0px ${accent}00`] } : {}}
      transition={critical ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : {}}
      style={{
        background: `linear-gradient(90deg, ${accent}16 0%, var(--bg-elevated) 60%)`,
        borderRadius: 6,
        padding: '5px 8px 5px 7px',
        borderTop: '1px solid var(--line-hair)', borderRight: '1px solid var(--line-hair)', borderBottom: '1px solid var(--line-hair)',
        borderLeft: `3px solid ${accent}`,
      }}
    >
      {children}
    </motion.div>
  )
}

export function TelemetryZone() {
  const raceState = useRaceStore(s => s.raceState)
  const config    = useRaceStore(s => s.config)

  if (!raceState || !config) return null

  const player = raceState.cars.find(c => c.isPlayer)
  if (!player) return null

  if (player.retired) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '6px 10px', background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--line-hair)', height: 130, flexShrink: 0,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--accent-warm)', letterSpacing: '0.05em' }}>
            DNF
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            Retired on lap {player.retiredLap ?? '—'} — {player.retiredCause === 'mechanical' ? 'mechanical failure' : 'tyre failure'}
          </div>
        </div>
      </div>
    )
  }

  const spec = config.compounds[player.compound]
  const driver = config.drivers.find(d => d.id === player.driverId)
  const effAge = driver && spec ? effectiveTyreAge(player, driver, raceState.weatherState, config.tuning) : player.tyreAge
  const wearRate = driver && spec ? effectiveTyreAge({ ...player, tyreAge: 1 }, driver, raceState.weatherState, config.tuning) : 1
  const fraction = spec ? tyreCliffFraction(spec, effAge) : 0
  const cliffIn = spec ? Math.max(0, Math.ceil((spec.cliff - effAge) / Math.max(wearRate, 0.01))) : null
  const pastCliff = fraction >= 1.0

  // Position readouts
  const sorted = [...raceState.cars].sort((a, b) => a.position - b.position)
  const totalCars = sorted.length
  const ahead = sorted.find(c => c.position === player.position - 1)
  const behind = sorted.find(c => c.position === player.position + 1)
  const gapAhead  = ahead  ? player.raceTime - ahead.raceTime  : null
  const gapBehind = behind ? behind.raceTime - player.raceTime : null

  // Pit window
  const nextStop = player.strategy.plannedStops[player.pitsDone] ?? null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 10px',
      background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--line-hair)',
      height: 130, flexShrink: 0,
    }}>
      {/* Left: radial tyre gauge */}
      <TyreGaugeRadial
        fraction={fraction}
        compound={player.compound}
        tyreAge={player.tyreAge}
      />

      {/* Right: 3 stat readouts */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
      }}>
        {/* 1. CLIFF */}
        <StatCard accent={gaugeColor(fraction)} critical={pastCliff || (cliffIn !== null && cliffIn <= 3)}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 8,
            color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 2,
          }}>
            CLIFF
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
            color: pastCliff ? '#FF4D5E'
              : cliffIn !== null && cliffIn <= 3 ? '#FF4D5E'
              : 'var(--text-hi)',
            fontVariantNumeric: 'tabular-nums',
            textShadow: pastCliff || (cliffIn !== null && cliffIn <= 3) ? '0 0 8px #FF4D5E77' : 'none',
          }}>
            {pastCliff
              ? '⚠ PAST CLIFF'
              : cliffIn !== null
              ? `~${cliffIn}L`
              : '—'}
          </div>
        </StatCard>

        {/* 2. POSITION */}
        <StatCard accent="#00E5D0">
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 8,
            color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 2,
          }}>
            POSITION
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
            color: 'var(--accent)', fontVariantNumeric: 'tabular-nums',
            textShadow: '0 0 8px rgba(0,229,208,0.45)',
          }}>
            P{player.position}
            <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 10, textShadow: 'none' }}>
              {' '}of {totalCars}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            {gapAhead !== null && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: gapAhead < 1.0 ? 'var(--positive)' : 'var(--text-mid)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                ▲ +{gapAhead.toFixed(1)}s
              </span>
            )}
            {gapBehind !== null && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: gapBehind < 1.0 ? 'var(--negative)' : 'var(--text-mid)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                ▼ −{gapBehind.toFixed(1)}s
              </span>
            )}
          </div>
        </StatCard>

        {/* 3. PIT WINDOW */}
        <StatCard accent="#9B8CFF">
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 8,
            color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 2,
          }}>
            PIT WINDOW
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
            color: nextStop ? 'var(--accent-violet)' : 'var(--text-mid)', fontVariantNumeric: 'tabular-nums',
          }}>
            {nextStop
              ? `Planned: L${nextStop.lap}`
              : 'No stop'}
          </div>
        </StatCard>
      </div>
    </div>
  )
}
