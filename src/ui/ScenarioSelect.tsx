import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import { useScenarioStore } from '@state/scenarioStore'
import { useSettingsStore } from '@state/settingsStore'
import { useUiTap } from '@hooks/useUiTap'
import { loadGameData, type ScenarioSpecData } from '@data/validators'
import type { Compound } from '@engine/types'
import { ScreenFrame, ScreenHeader, Pill, TyreChip, KitButton, CircuitOutline, snapIn, EASE } from '@ui/kit'

// Module scope, not per render -- this screen never needs to re-parse the
// scenario data on every re-render.
const GAME = loadGameData()
const SCENARIOS = GAME.scenarios

function ScenarioCard({ spec, index, expanded, onToggle }: {
  spec: ScenarioSpecData
  index: number
  expanded: boolean
  onToggle: () => void
}) {
  const uiTap = useUiTap()
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const select = useScenarioStore(s => s.select)
  const startScenarioPhase = useSeasonStore(s => s.startScenarioPhase)
  const circuit = GAME.circuits[spec.circuitId]
  const circuitName = circuit?.name ?? spec.circuitId

  function takeOver() {
    uiTap()
    select(spec)
    startScenarioPhase()
  }

  return (
    <motion.div {...snapIn(reducedMotion, index)}>
      <div
        className="slant-lg kit-focus"
        onClick={onToggle}
        // A non-native element with role="button" does NOT synthesise a click
        // from Enter or Space; TAKE OVER lives in the expanded region, so
        // without this a keyboard user could never reach it.
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        style={{ background: 'var(--grape)', cursor: 'pointer', padding: '16px 20px 16px 24px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 28,
              lineHeight: 1, textTransform: 'uppercase', color: 'var(--white)', overflowWrap: 'anywhere',
            }}>
              {spec.name}
            </div>
            <div style={{
              marginTop: 6, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 12,
              letterSpacing: 1, color: 'var(--lilac-dim)',
            }}>
              {circuitName.toUpperCase()}
            </div>
          </div>
          <CircuitOutline circuitId={spec.circuitId} width={72} height={56} label={`${circuitName} layout`} />
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="briefing"
              initial={reducedMotion ? false : { height: 0, opacity: 0 }}
              animate={reducedMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: EASE }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--lilac)', lineHeight: 1.45 }}>
                  {spec.blurb}
                </div>

                {/* Situation readout from `expect` -- never re-simulated here. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Pill>{`P${spec.expect.position}`}</Pill>
                  <Pill>{`${spec.expect.lapsRemaining} LAPS LEFT`}</Pill>
                  <Pill>
                    <TyreChip compound={spec.expect.compound as Compound} size={20} />
                    {/* The compound letter is printed with the age too: colour is never the only signal. */}
                    <span>{`${spec.expect.compound}${spec.expect.tyreAge}`}</span>
                  </Pill>
                  {spec.expect.safetyCarOut && <Pill tone="caution">{'⚠ SAFETY CAR'}</Pill>}
                </div>

                <div style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 15, letterSpacing: 1, color: 'var(--volt)' }}>
                  {`FINISH P${spec.goal.position} OR BETTER`}
                </div>

                {/* stopPropagation: a tap on the button must not also collapse the card. */}
                <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <KitButton variant="primary" size="md" onClick={takeOver}>TAKE OVER</KitButton>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

export function ScenarioSelect() {
  const exitScenarios = useSeasonStore(s => s.exitScenarios)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <ScreenFrame label="Scenarios">
      <ScreenHeader eyebrow="SCENARIOS" title="Jump in" onBack={exitScenarios} />
      <div style={{ padding: '6px 16px 0', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--lilac)', flexShrink: 0 }}>
        Drop into a race already in progress.
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {SCENARIOS.map((spec, i) => (
          <ScenarioCard
            key={spec.id}
            spec={spec}
            index={i}
            expanded={expandedId === spec.id}
            onToggle={() => setExpandedId(prev => (prev === spec.id ? null : spec.id))}
          />
        ))}
      </div>
    </ScreenFrame>
  )
}
