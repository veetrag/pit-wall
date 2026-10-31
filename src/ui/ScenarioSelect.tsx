import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import { useScenarioStore, packOf, type ScenarioBest } from '@state/scenarioStore'
import { useSettingsStore } from '@state/settingsStore'
import { useUiTap } from '@hooks/useUiTap'
import { loadGameData, type ScenarioSpecData } from '@data/validators'
import type { Compound } from '@engine/types'
import { ScreenFrame, ScreenHeader, Pill, TyreChip, KitButton, CircuitOutline, Tabs, TraitPills, snapIn, EASE } from '@ui/kit'
import { DailyCard } from '@ui/DailyCard'
import { MyStarts } from '@ui/MyStarts'

// Module scope, not per render -- this screen never needs to re-parse the
// scenario data on every re-render.
const GAME = loadGameData()
const SCENARIOS = GAME.scenarios
const CORE = SCENARIOS.filter(s => packOf(s) === 'core')
const CLASSICS = SCENARIOS.filter(s => packOf(s) === 'historic')

/** The hub's tabs. 'starts' is rendered from Task 19 (MY STARTS). */
export type HubTab = 'scenarios' | 'classics' | 'daily' | 'starts'

/** The scenario's best finish so far: volt with a tick once the goal is met. */
function BestPill({ best }: { best: ScenarioBest }) {
  const p = best.position === null ? 'DNF' : `P${best.position}`
  return (
    <div style={{ marginTop: 8 }}>
      <Pill tone={best.met ? 'volt' : 'dusk'} ariaLabel={`Best finish ${p}, ${best.met ? 'goal met' : 'goal not met yet'}`}>
        {best.met ? `BEST ${p} ✓` : `BEST ${p}`}
      </Pill>
    </div>
  )
}

function ScenarioCard({ spec, index, expanded, onToggle }: {
  spec: ScenarioSpecData
  index: number
  expanded: boolean
  onToggle: () => void
}) {
  const uiTap = useUiTap()
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const select = useScenarioStore(s => s.select)
  const best = useScenarioStore(s => s.best[spec.id])
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
            {spec.inspiredBy && (
              <div style={{ marginTop: 4, fontFamily: 'var(--font-body)', fontStyle: 'italic', fontSize: 13, color: 'var(--lilac)' }}>{spec.inspiredBy}</div>
            )}
            {spec.era && <div style={{ marginTop: 8 }}><Pill tone="dusk">{spec.era}</Pill></div>}
            {best && <BestPill best={best} />}
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
                  <Pill tone="dusk">{`P${spec.expect.position}`}</Pill>
                  <Pill tone="dusk">{`${spec.expect.lapsRemaining} LAPS LEFT`}</Pill>
                  <Pill tone="dusk">
                    <TyreChip compound={spec.expect.compound as Compound} size={20} />
                    {/* The compound letter is printed with the age too: colour is never the only signal. */}
                    <span>{`${spec.expect.compound}${spec.expect.tyreAge}`}</span>
                  </Pill>
                  {spec.expect.safetyCarOut && <Pill tone="caution">{'⚠ SAFETY CAR'}</Pill>}
                  {spec.sprint && <Pill tone="dusk">SPRINT</Pill>}
                  {spec.expect.vscOut && <Pill tone="caution">{'⚠ VSC'}</Pill>}
                  {spec.expect.redFlag && <Pill tone="hot">{'⚠ RED FLAG'}</Pill>}
                  {spec.expect.dampAhead && <Pill tone="rain">{`RAIN WITHIN ${spec.expect.dampAhead} LAPS`}</Pill>}
                  {spec.expect.dryingAhead && <Pill tone="rain">{`DRY WITHIN ${spec.expect.dryingAhead} LAPS`}</Pill>}
                  <TraitPills circuitId={spec.circuitId} />
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
  const [tab, setTab] = useState<HubTab>('scenarios')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  useEffect(() => { void useScenarioStore.getState().loadBest() }, [])

  const list = tab === 'scenarios' ? CORE : tab === 'classics' ? CLASSICS : []

  return (
    <ScreenFrame label="Challenges">
      <ScreenHeader eyebrow="CHALLENGES" title="Jump in" onBack={exitScenarios} />
      <div style={{ padding: '6px 16px 0', flexShrink: 0 }}>
        <Tabs
          ariaLabel="Challenges"
          idPrefix="challenges"
          value={tab}
          onChange={setTab}
          tabs={[{ value: 'scenarios', label: 'SCENARIOS' }, { value: 'classics', label: 'CLASSICS' }, { value: 'daily', label: 'DAILY' }, { value: 'starts', label: 'MY STARTS' }]}
        />
      </div>
      <div role="tabpanel" id="challenges-panel" aria-labelledby={`challenges-tab-${tab}`}
        style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tab === 'daily'
          ? <DailyCard />
          : tab === 'starts'
          ? <MyStarts />
          : list.map((spec, i) => (
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
