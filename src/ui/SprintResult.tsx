import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import { useDebriefStore } from '@state/debriefStore'
import { useUiTap } from '@hooks/useUiTap'
import { loadGameData } from '@data/validators'
import { HeroBand, KitButton, StandingRow, ScreenFrame, snapIn, useCountUp, useReducedMotion } from '@ui/kit'
import { DebriefCard } from './DebriefCard'
import { LapChartCard } from './LapChart'

const label = { fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12, letterSpacing: '0.14em' } as const
const numeric = { fontVariantNumeric: 'tabular-nums' as const }

/**
 * The sprint's result (spec 1.5 §3): finish, sprint points, the lap chart and
 * the debrief. The points are shown but not counted until ON TO THE GRAND
 * PRIX; RETRY SPRINT throws the attempt away. One qualifying set both grids,
 * so the Grand Prix does not start from this result.
 */
export function SprintResult() {
  const lastSprintResults = useSeasonStore(s => s.lastSprintResults)
  const playerDriverId = useSeasonStore(s => s.playerDriverId)
  const raceIndex = useSeasonStore(s => s.raceIndex)
  const currentCircuitId = useSeasonStore(s => s.currentCircuitId)
  const toGrandPrix = useSeasonStore(s => s.toGrandPrix)
  const retrySprint = useSeasonStore(s => s.retrySprint)
  const reduced = useReducedMotion()
  const uiTap = useUiTap()
  const data = useMemo(() => loadGameData(), [])
  const [showAll, setShowAll] = useState(false)

  const sorted = [...(lastSprintResults ?? [])].sort((a, b) => a.position - b.position)
  const mine = sorted.find(r => r.driverId === playerDriverId)
  const earned = mine?.points ?? 0
  const shownPoints = useCountUp(earned)
  const retired = mine?.retired ?? false
  const ink = retired ? 'var(--white)' : 'var(--ink)'
  const circuitName = (data.circuits[currentCircuitId()]?.name ?? '').toUpperCase()
  const drivers = new Map(data.drivers.drivers.map(d => [d.id, d]))
  const teamColor = new Map(data.cars.teams.map(t => [t.id, t.colorPrimary]))
  const scoringPlaces = data.tuning.sprint.points.length
  const rows = showAll ? sorted : sorted.slice(0, scoringPlaces)

  let step = 0
  const next = () => snapIn(reduced, step++)

  return (
    <ScreenFrame label="Sprint result">
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        <div style={{ position: 'relative', overflow: 'hidden', minHeight: 230, padding: '40px 22px 20px' }}>
          <HeroBand color={retired ? 'var(--grape)' : 'var(--volt)'} height={200} top={12} />
          <div style={{ position: 'relative', color: ink, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <motion.div {...next()} style={{ ...label, color: ink }}>
              {`${circuitName ? `${circuitName} · ` : ''}ROUND ${raceIndex + 1} · SPRINT`}
            </motion.div>
            <motion.div {...next()} style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 120, lineHeight: 0.85, ...numeric }}>
                {!mine ? '—' : retired ? 'DNF' : `P${mine.position}`}
              </span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 30, lineHeight: 1, paddingBottom: 8, ...numeric }}>
                {/* Big Shoulders has no tabular figures: an invisible twin of the
                    final value sizes the box so the count-up never shifts. */}
                {earned > 0
                  ? <span style={{ display: 'inline-grid' }}>
                      <span aria-hidden="true" style={{ gridArea: '1 / 1', visibility: 'hidden' }}>{`+${earned} SPRINT PTS`}</span>
                      <span style={{ gridArea: '1 / 1' }}>{`+${shownPoints} SPRINT PTS`}</span>
                    </span>
                  : 'NO SPRINT POINTS'}
              </span>
            </motion.div>
            <motion.div {...next()} style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, lineHeight: 1.3, maxWidth: 320 }}>
              The Grand Prix starts from the same qualifying grid.
            </motion.div>
          </div>
        </div>

        <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <LapChartCard />
          <DebriefCard />
          <div role="region" aria-label="Sprint classification" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {rows.map(r => {
              const d = drivers.get(r.driverId)
              return (
                <StandingRow key={r.driverId} pos={r.retired ? <span style={{ color: r.driverId === playerDriverId ? 'var(--ink)' : 'var(--hot)' }}>DNF</span> : r.position}
                  teamColor={(d && teamColor.get(d.teamId)) || 'var(--dusk)'}
                  name={d?.code ?? r.driverId} value={<span style={numeric}>{`+${r.points}`}</span>}
                  mine={r.driverId === playerDriverId} />
              )
            })}
            {sorted.length > scoringPlaces && (
              <button type="button" className="kit-focus" aria-expanded={showAll}
                onClick={() => { uiTap(); setShowAll(v => !v) }}
                style={{ minHeight: 48, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--lilac)',
                  fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 13 }}>
                {showAll ? 'POINTS PLACES ↑' : `ALL ${sorted.length} DRIVERS ↓`}
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 16px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--ink)', position: 'relative', zIndex: 2 }}>
        <KitButton variant="primary" size="lg" style={{ width: '100%' }}
          onClick={() => { useDebriefStore.getState().cancel(); toGrandPrix() }}>
          ON TO THE GRAND PRIX →
        </KitButton>
        <KitButton variant="secondary" size="sm" style={{ width: '100%' }}
          onClick={() => { useDebriefStore.getState().cancel(); retrySprint() }}>
          ↺ RETRY SPRINT
        </KitButton>
      </div>
    </ScreenFrame>
  )
}
