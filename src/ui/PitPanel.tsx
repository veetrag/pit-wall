import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { useCoachStore } from '@state/coachStore'
import { useCoachingActive } from '@hooks/useCoachingActive'
import type { Compound } from '@engine/types'
import type { ProjectionResult } from '@engine/projection'
import { tyreCliffFraction, effectiveTyreAge } from '@engine/index'
import { effectivePitLaneLoss } from '@engine/incidents'
import { useHaptics, ImpactStyle } from '@hooks/useHaptics'
import { useSafetyCar } from '@hooks/useSafetyCar'
import { soundService } from '@audio/soundService'
import { KitButton, useReducedMotion } from '@ui/kit'

function driverCode(id: string | null, drivers: { id: string; code: string }[]): string {
  if (!id) return '---'
  return drivers.find(d => d.id === id)?.code ?? id.replace('d_', '').toUpperCase().slice(0, 3)
}

function ProjectionCard({ result }: { result: ProjectionResult }) {
  const config = useRaceStore(s => s.config)
  const drivers = config?.drivers ?? []

  const aheadCode = driverCode(result.driverAheadId, drivers)
  const behindCode = driverCode(result.driverBehindId, drivers)

  return (
    <motion.div
      key={result.rejoinPosition}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        background: 'var(--bg-panel)', borderRadius: 8, padding: '10px 14px',
        marginBottom: 16, border: '1px solid var(--line-hair)',
      }}
    >
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 10, color: 'var(--text-dim)',
        letterSpacing: '0.1em', marginBottom: 6,
      }}>
        PROJECTED REJOIN
      </div>

      {/* Big position */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700,
          color: 'var(--accent)', lineHeight: 1,
        }}>
          P{result.rejoinPosition}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {result.driverAheadId && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: 'var(--negative)', fontVariantNumeric: 'tabular-nums',
            }}>
              +{result.rejoinGap.toFixed(1)}s behind {aheadCode}
            </span>
          )}
          {result.driverBehindId && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: 'var(--positive)', fontVariantNumeric: 'tabular-nums',
            }}>
              +{result.rejoinGapBehind.toFixed(1)}s clear of {behindCode}
            </span>
          )}
        </div>
      </div>

      {/* Net estimate */}
      {result.netEstimatePosition !== result.rejoinPosition && (
        <div style={{
          borderTop: '0.5px solid var(--line-hair)', paddingTop: 6,
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          recovers to ~P{result.netEstimatePosition} by lap {result.netEstimateLap}
        </div>
      )}
    </motion.div>
  )
}

/**
 * Spec section 6 surface 2 -- the pit loss that applies RIGHT NOW.
 *
 * Routed through effectivePitLaneLoss rather than computed here. That function
 * is the single source of truth shared with race.ts, projection.ts and
 * raceStore.ts; a display that did its own arithmetic could promise a discount
 * the race then failed to give, by 8-12s, on the game's centrepiece decision.
 */
function PitLossLine() {
  const config = useRaceStore(s => s.config)
  const safetyCar = useSafetyCar()
  if (!config) return null

  const loss = effectivePitLaneLoss(config.circuit, safetyCar, config.tuning)
  const saving = config.circuit.pitLaneTimeLoss - loss
  const discounted = safetyCar !== null && saving > 0

  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
      marginBottom: 14, paddingBottom: 10,
      borderBottom: '1px solid var(--line-hair)',
    }}>
      <span style={{
        fontFamily: 'var(--font-display)', fontSize: 10,
        color: 'var(--text-dim)', letterSpacing: '0.1em',
      }}>
        PIT LOSS
      </span>
      <span className="mono" style={{
        fontSize: 18, fontWeight: 700,
        color: discounted ? 'var(--caution)' : 'var(--text-hi)',
      }}>
        {loss.toFixed(1)}s
      </span>
      {discounted && (
        <span className="mono" style={{
          fontSize: 11, fontWeight: 700, color: 'var(--caution)', letterSpacing: '0.04em',
        }}>
          −{saving.toFixed(1)}s UNDER SAFETY CAR
        </span>
      )}
    </div>
  )
}

const ALL_COMPOUNDS: { id: Compound; label: string; colorVar: string; wet: boolean }[] = [
  { id: 'S', label: 'SOFT',   colorVar: 'var(--tyre-soft)',              wet: false },
  { id: 'M', label: 'MEDIUM', colorVar: 'var(--tyre-medium)',            wet: false },
  { id: 'H', label: 'HARD',   colorVar: 'var(--tyre-hard)',              wet: false },
  { id: 'I', label: 'INTER',  colorVar: 'var(--tyre-inter, #39B54A)',    wet: true  },
  { id: 'W', label: 'WET',    colorVar: 'var(--tyre-wet, #4DA6FF)',      wet: true  },
]

function PitPanelDrawer() {
  const { pitNow, closePitPanel, projectionResult, updateProjection } = useRaceStore()
  const raceState = useRaceStore(s => s.raceState)
  const { impact } = useHaptics()
  const coaching = useCoachingActive()
  const request = useCoachStore(s => s.request)

  useEffect(() => {
    if (coaching && projectionResult) request('projection')
  }, [coaching, projectionResult]) // eslint-disable-line react-hooks/exhaustive-deps

  // Show wet compounds when conditions are damp/wet now or within next 2 laps
  const lap = raceState?.lap ?? 0
  const timeline = raceState?.weatherTimeline ?? []
  const now = timeline[lap] ?? raceState?.weatherState ?? 'DRY'
  const soon = timeline[lap + 1] ?? now
  const later = timeline[lap + 2] ?? soon
  const wetsRelevant = now !== 'DRY' || soon !== 'DRY' || later !== 'DRY'

  const availableCompounds = ALL_COMPOUNDS.filter(c => !c.wet || wetsRelevant)

  const [selected, setSelected] = useState<Compound>('M')

  function handleSelect(c: Compound) {
    setSelected(c)
    updateProjection(c)
  }

  function handleConfirm() {
    impact(ImpactStyle.Heavy)
    soundService.play('pitConfirm')
    pitNow(selected)
  }

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'var(--bg-elevated)', borderRadius: '16px 16px 0 0',
        /*
         * --safe-bottom, not a bare 32px.
         *
         * RaceHUD pads its root by --safe-bottom, but this drawer is
         * position:absolute against that root, so it sits OUTSIDE that padding
         * and runs under the system navigation bar. Measured on a Pixel 10 Pro
         * XL (targetSdk 36, edge-to-edge): BOX NOW -- the primary action on the
         * game's centrepiece interaction -- was clipped by the nav bar.
         */
        padding: '20px 20px calc(32px + var(--safe-bottom))',
        borderTop: '1px solid var(--line-hair)',
        zIndex: 100,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.05em' }}>
          PIT STOP
        </span>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={closePitPanel}
          style={{
            background: 'transparent', border: '1px solid var(--line-hair)',
            borderRadius: 6, padding: '4px 10px', color: 'var(--text-dim)',
            fontFamily: 'var(--font-display)', fontSize: 12, cursor: 'pointer',
          }}
        >
          CANCEL
        </motion.button>
      </div>

      <PitLossLine />

      {projectionResult && <ProjectionCard result={projectionResult} />}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {availableCompounds.map(({ id, label, colorVar, wet }) => {
          const active = selected === id
          return (
            <motion.button
              key={id}
              whileTap={{ scale: 0.94 }}
              onClick={() => handleSelect(id)}
              style={{
                flex: '1 1 calc(33% - 8px)', minWidth: 60,
                border: 'none', borderRadius: 10, padding: '12px 6px',
                cursor: 'pointer',
                background: active ? colorVar : 'var(--bg-panel)',
                outline: active ? 'none' : wet ? `1px solid ${colorVar}66` : `1px solid var(--line-hair)`,
                boxShadow: active ? `0 0 16px ${colorVar}66` : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700,
                color: active ? 'var(--bg-deep)' : colorVar,
                letterSpacing: '0.08em',
              }}>
                {id}
              </div>
              <div style={{
                fontFamily: 'var(--font-body)', fontSize: 10,
                color: active ? 'rgba(0,0,0,0.6)' : 'var(--text-dim)',
                marginTop: 2,
              }}>
                {label}
              </div>
            </motion.button>
          )
        })}
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleConfirm}
        style={{
          width: '100%', border: 'none', borderRadius: 10, padding: '16px',
          background: 'var(--accent-warm)', color: 'var(--bg-deep)',
          fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
          letterSpacing: '0.08em', cursor: 'pointer',
        }}
      >
        BOX NOW
      </motion.button>
    </motion.div>
  )
}

export function PitButton() {
  const openPitPanel = useRaceStore(s => s.openPitPanel)
  const phase = useRaceStore(s => s.phase)
  const raceState = useRaceStore(s => s.raceState)
  const config = useRaceStore(s => s.config)
  const projectionResult = useRaceStore(s => s.projectionResult)
  const reducedMotion = useReducedMotion()

  if (phase !== 'racing') return null

  const player = raceState?.cars.find(c => c.isPlayer)
  const spec = player && config ? config.compounds[player.compound] : undefined
  const driver = player && config ? config.drivers.find(d => d.id === player.driverId) : undefined
  const effAge = spec && player && driver && raceState ? effectiveTyreAge(player, driver, raceState.weatherState, config!.tuning) : player?.tyreAge ?? 0
  const fraction = spec && player ? tyreCliffFraction(spec, effAge) : 0
  const isUrgent = fraction >= 0.85

  const projLabel = projectionResult
    ? `PIT — P${projectionResult.rejoinPosition}`
    : 'PIT'

  // Opacity-only pulse on a wrapper (KitButton owns its own press scale), and
  // none at all under reduced motion -- the hot fill already says "urgent".
  const pulse = isUrgent && !reducedMotion
  return (
    <motion.div
      animate={pulse ? { opacity: [1, 0.7, 1] } : { opacity: 1 }}
      transition={pulse ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }}
      style={{ flexShrink: 0, display: 'flex' }}
    >
      <KitButton
        variant="urgent"
        size="lg"
        onClick={openPitPanel}
        style={{
          width: 112, padding: '0 8px', whiteSpace: 'nowrap',
          // "PIT — P12" does not fit 112px at the lg display size.
          fontSize: projectionResult ? 18 : 30,
        }}
      >
        {projLabel}
      </KitButton>
    </motion.div>
  )
}

export function PitPanel() {
  const pitPanelOpen = useRaceStore(s => s.pitPanelOpen)

  return (
    <AnimatePresence>
      {pitPanelOpen && <PitPanelDrawer />}
    </AnimatePresence>
  )
}
