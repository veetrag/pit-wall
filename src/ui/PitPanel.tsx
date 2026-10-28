import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { useCoachStore } from '@state/coachStore'
import { useCoachingActive } from '@hooks/useCoachingActive'
import type { Compound } from '@engine/types'
import type { ProjectionResult } from '@engine/projection'
import { tyreCliffFraction, effectiveTyreAge } from '@engine/index'
import { effectivePitLaneLoss, neutralisationKind } from '@engine/incidents'
import { useHaptics, ImpactStyle } from '@hooks/useHaptics'
import { useSafetyCar } from '@hooks/useSafetyCar'
import { soundService } from '@audio/soundService'
import { KitButton, Pill, TyreChip, EASE, useReducedMotion, PRESS } from '@ui/kit'
import { useUiTap } from '@hooks/useUiTap'

function driverCode(id: string | null, drivers: { id: string; code: string }[]): string {
  if (!id) return '---'
  return drivers.find(d => d.id === id)?.code ?? id.replace('d_', '').toUpperCase().slice(0, 3)
}

const ROW_STYLE = {
  display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, padding: '0 16px',
  fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14,
  fontVariantNumeric: 'tabular-nums' as const,
}

/**
 * The projection as a 3-row mini tower: the car you would rejoin behind, a
 * dashed "ghost" row for you, and the car you would rejoin ahead of. Rows only
 * appear when the projection names that car (P1 has nobody ahead).
 */
function ProjectionCard({ result, compoundLabel }: { result: ProjectionResult; compoundLabel: string }) {
  const config = useRaceStore(s => s.config)
  const drivers = config?.drivers ?? []
  const reduced = useReducedMotion()

  const aheadCode = driverCode(result.driverAheadId, drivers)
  const behindCode = driverCode(result.driverBehindId, drivers)
  const myCode = driverCode(config?.playerDriverId ?? null, drivers)
  // `?? 0`: a partial result (tests, or a projection mid-compute) must not throw.
  const gapAhead = (result.rejoinGap ?? 0).toFixed(1)
  const gapBehind = (result.rejoinGapBehind ?? 0).toFixed(1)

  return (
    <motion.div
      key={result.rejoinPosition}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE }}
      style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700,
        color: 'var(--lilac-dim)', letterSpacing: 1, marginBottom: 2,
      }}>
        PROJECTED REJOIN
      </div>

      {result.driverAheadId && (
        <div className="slant-row" style={{ ...ROW_STYLE, background: 'var(--grape)', color: 'var(--lilac)' }}>
          <span style={{ width: 36 }}>P{result.rejoinPosition - 1}</span>
          <span style={{ flex: 1, color: 'var(--white)' }}>{aheadCode}</span>
        </div>
      )}

      {/* Not slanted: clip-path would cut the dashed border away. */}
      <div data-testid="ghost-row" style={{
        ...ROW_STYLE, minHeight: 48, border: '2px dashed var(--volt)', color: 'var(--volt)',
        background: 'rgba(var(--volt-rgb), 0.08)',
      }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 24 }}>
          P{result.rejoinPosition}
        </span>
        <span> · {myCode} · +{gapAhead}s · fresh {compoundLabel}</span>
      </div>

      {result.driverBehindId && (
        <div className="slant-row" style={{ ...ROW_STYLE, background: 'var(--grape)', color: 'var(--lilac)' }}>
          <span style={{ width: 36 }}>P{result.rejoinPosition + 1}</span>
          <span style={{ flex: 1, color: 'var(--white)' }}>{behindCode}</span>
          <span>+{gapBehind}s</span>
        </div>
      )}

      {result.netEstimatePosition !== result.rejoinPosition && (
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--lilac-dim)',
          fontVariantNumeric: 'tabular-nums', marginTop: 2,
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
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, fontVariantNumeric: 'tabular-nums' }}>
      <Pill>PIT LOSS {loss.toFixed(1)}s</Pill>
      {discounted && (
        <Pill tone="caution">
          −{saving.toFixed(1)}s UNDER {({ sc: 'SAFETY CAR', vsc: 'VSC', red: 'RED FLAG' } as const)[neutralisationKind(safetyCar) ?? 'sc']}
        </Pill>
      )}
    </div>
  )
}

const ALL_COMPOUNDS: { id: Compound; label: string; wet: boolean }[] = [
  { id: 'S', label: 'SOFT',   wet: false },
  { id: 'M', label: 'MEDIUM', wet: false },
  { id: 'H', label: 'HARD',   wet: false },
  { id: 'I', label: 'INTER',  wet: true  },
  { id: 'W', label: 'WET',    wet: true  },
]

function PitPanelDrawer() {
  const { pitNow, closePitPanel, projectionResult, updateProjection } = useRaceStore()
  const raceState = useRaceStore(s => s.raceState)
  const { impact } = useHaptics()
  const uiTap = useUiTap()
  const reduced = useReducedMotion()
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
  // `cars?.`: a partially-built race state (tests) may have no cars yet; the
  // sets line is then simply omitted rather than guessed.
  const allocation = raceState?.cars?.find(c => c.isPlayer)?.tyreAllocation

  // A compound with no sets left cannot be fitted (the engine would substitute
  // another or not stop at all), so it is not offered. Unknown allocation
  // (no player car in state) means nothing is gated.
  const hasSets = (c: Compound) => allocation === undefined || allocation[c] > 0
  const anySets = availableCompounds.some(c => hasSets(c.id))

  // Medium by default, else the first offered compound that still has a set.
  const [selected, setSelected] = useState<Compound>(() =>
    hasSets('M') ? 'M' : availableCompounds.find(c => hasSets(c.id))?.id ?? 'M')
  const selectedLabel = ALL_COMPOUNDS.find(c => c.id === selected)?.label ?? selected

  // Show the rejoin for the default compound straight away, not only after a tap.
  useEffect(() => {
    if (!projectionResult && anySets) updateProjection(selected)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelect(c: Compound) {
    if (!hasSets(c)) return
    uiTap()
    setSelected(c)
    updateProjection(c)
  }

  function handleConfirm() {
    if (!anySets) return
    impact(ImpactStyle.Heavy)
    soundService.play('pitConfirm')
    pitNow(selected)
  }

  const sheetMotion = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }

  return (
    // The wrapper slides; the sheet inside it is clipped to the slant. Split
    // so the scrim can live outside the clip and travel with the sheet.
    <motion.div
      {...sheetMotion}
      transition={{ duration: 0.22, ease: EASE }}
      className="text-zoom"
      style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100 }}
    >
      {/*
        * Scrim above the slant. Without it the slanted top edge sliced a
        * timing-tower row on the diagonal and the half-row read as content
        * (1.4 phone pass). Deepest in the band just above the edge, so the row
        * the sheet overlaps fades out rather than being cut; lighter further
        * up, so the race behind stays readable.
        *
        * bottom: 97% puts its lower edge at the slant's LOWEST point (the
        * clip's 3%), so it fills the wedge beside the slant and the sheet
        * paints over the rest. pointer-events none: the speed control above
        * must stay live, because at 4x a lap passes in under a second and
        * pausing to think is the player's only defence.
        */}
      <div
        data-testid="pit-scrim"
        aria-hidden="true"
        style={{
          position: 'absolute', left: 0, right: 0, bottom: '97%', height: '100vh',
          pointerEvents: 'none',
          background: 'linear-gradient(to top, rgba(var(--ink-rgb), 0.96) 0, rgba(var(--ink-rgb), 0.96) 16px, rgba(var(--ink-rgb), 0.55) 72px, rgba(var(--ink-rgb), 0.45) 100%)',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Box this lap?"
        style={{
          position: 'relative',
          background: 'var(--night)',
          clipPath: 'polygon(0 3%,100% 0,100% 100%,0 100%)',
          /*
           * --safe-bottom, not a bare 32px.
           *
           * RaceHUD pads its root by --safe-bottom, but this drawer is
           * position:absolute against that root, so it sits OUTSIDE that padding
           * and runs under the system navigation bar. Measured on a Pixel 10 Pro
           * XL (targetSdk 36, edge-to-edge): BOX NOW -- the primary action on the
           * game's centrepiece interaction -- was clipped by the nav bar.
           */
          padding: '34px 20px calc(32px + var(--safe-bottom))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 900, fontStyle: 'italic',
            color: 'var(--white)', lineHeight: 1, textTransform: 'uppercase',
          }}>
            BOX THIS LAP?
          </span>
          <motion.button
            type="button"
            className="kit-focus"
            whileTap={reduced ? undefined : { scale: 0.96 }} transition={PRESS}
            onClick={() => { uiTap(); closePitPanel() }}
            style={{
              minHeight: 48, minWidth: 48, padding: '0 18px', borderRadius: 999, border: 'none',
              background: 'var(--grape)', color: 'var(--white)', cursor: 'pointer', flexShrink: 0,
              fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 13, letterSpacing: 1,
            }}
          >
            CANCEL
          </motion.button>
        </div>

        <PitLossLine />

        {projectionResult && <ProjectionCard result={projectionResult} compoundLabel={selectedLabel} />}

        <div role="radiogroup" aria-label="Compound" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
          {availableCompounds.map(({ id, label }) => {
            const active = selected === id
            const sets = allocation?.[id]
            const empty = !hasSets(id)
            return (
              <motion.button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-disabled={empty || undefined}
                className="slant-sm kit-focus"
                whileTap={reduced || empty ? undefined : { scale: 0.96 }} transition={PRESS}
                onClick={() => handleSelect(id)}
                style={{
                  flex: '1 1 calc(33% - 6px)', minWidth: 72, minHeight: 64,
                  border: 'none', padding: '6px 14px', cursor: empty ? 'default' : 'pointer',
                  opacity: empty ? 0.4 : 1,
                  background: active ? 'var(--volt)' : 'var(--grape)',
                  color: active ? 'var(--ink)' : 'var(--white)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <TyreChip compound={id} size={24} onInk={!active} />
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 14, letterSpacing: 0.5 }}>
                    {label}
                  </span>
                  {sets !== undefined && (
                    <span style={{
                      fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11,
                      color: active ? 'var(--dusk)' : 'var(--lilac-dim)', fontVariantNumeric: 'tabular-nums',
                    }}>
                      {sets} set{sets === 1 ? '' : 's'}
                    </span>
                  )}
                </span>
              </motion.button>
            )
          })}
        </div>

        {/* haptic={false}: handleConfirm fires Heavy itself; the kit's Medium on top would double-buzz. */}
        {!anySets && (
          <div role="status" style={{
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, color: 'var(--lilac)', marginBottom: 10,
          }}>
            No sets left to fit.
          </div>
        )}
        <KitButton variant="urgent" size="lg" haptic={false} disabled={!anySets} onClick={handleConfirm} style={{ width: '100%' }}>
          BOX NOW
        </KitButton>
      </div>
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
  const effAge = spec && player && driver && raceState ? effectiveTyreAge(player, driver, raceState.weatherState, config!) : player?.tyreAge ?? 0
  const fraction = spec && player ? tyreCliffFraction(spec, effAge) : 0
  // The pit lane is closed under a red flag; the free change comes on the card.
  const red = neutralisationKind(raceState?.safetyCar ?? null) === 'red'
  const isUrgent = fraction >= 0.85 && !red

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
        disabled={red}
        ariaLabel={red ? 'Pit lane closed: red flag' : undefined}
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
