import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import { useScenarioStore } from '@state/scenarioStore'
import { useSettingsStore } from '@state/settingsStore'
import { useUiTap } from '@hooks/useUiTap'
import { loadGameData, type ScenarioSpecData } from '@data/validators'

// Module scope, not per render -- this screen never needs to re-parse the
// scenario data on every re-render, and the brief calls this out explicitly.
const GAME = loadGameData()
const SCENARIOS = GAME.scenarios

// Compound letter -> the CSS custom property carrying its colour, per
// src/data/compounds.json. S/M/H map onto the tokens CLAUDE.md documents;
// I and W are real shipped compounds (one scenario hands over on I40) with
// their own tokens, so they must not silently fall through to `undefined`
// and render invisible text.
const COMPOUND_TOKEN: Record<string, string> = {
  S: 'var(--tyre-soft)',
  M: 'var(--tyre-medium)',
  H: 'var(--tyre-hard)',
  I: 'var(--tyre-inter)',
  W: 'var(--tyre-wet)',
}

function compoundToken(letter: string): string {
  return COMPOUND_TOKEN[letter] ?? 'var(--text-mid)'
}

function ScenarioCard({ spec, expanded, onToggle }: {
  spec: ScenarioSpecData
  expanded: boolean
  onToggle: () => void
}) {
  const uiTap = useUiTap()
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const select = useScenarioStore(s => s.select)
  const startScenarioPhase = useSeasonStore(s => s.startScenarioPhase)
  const circuit = GAME.circuits[spec.circuitId]

  function takeOver() {
    uiTap()
    select(spec)
    startScenarioPhase()
  }

  return (
    <motion.div
      layout={!reducedMotion}
      whileTap={{ scale: 0.97 }}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      style={{
        border: expanded ? '1px solid var(--accent)' : '1px solid var(--line-hair)',
        borderRadius: 14,
        background: 'var(--bg-elevated)',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
          color: 'var(--text-hi)', letterSpacing: '0.02em',
        }}>
          {spec.name}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-mid)', letterSpacing: '0.06em',
        }}>
          {circuit?.name.toUpperCase() ?? spec.circuitId.toUpperCase()}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="briefing"
            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
            animate={reducedMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                height: 1, background: 'var(--line-hair)', margin: '0 0 2px',
              }} />

              <div style={{
                fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--text-mid)', lineHeight: 1.45,
              }}>
                {spec.blurb}
              </div>

              {/* Situation readout, derived from `expect` -- never re-simulated
                  on this screen. It keeps this screen instant, and the source
                  of truth (Task 2's test) guarantees `expect` matches what the
                  engine will actually hand the player. */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em',
              }}>
                <span style={{ color: 'var(--text-hi)' }}>{`P${spec.expect.position}`}</span>
                <span style={{ color: 'var(--line-hair)' }} aria-hidden>·</span>
                <span style={{ color: 'var(--text-hi)' }}>{`${spec.expect.lapsRemaining} LAPS LEFT`}</span>
                <span style={{ color: 'var(--line-hair)' }} aria-hidden>·</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: compoundToken(spec.expect.compound),
                      border: '1px solid rgba(255,255,255,0.3)',
                      flexShrink: 0,
                    }}
                  />
                  {/* Colour is never the only signal (CLAUDE.md §6.3) -- the
                      compound letter is always printed alongside the dot. */}
                  <span style={{ color: 'var(--text-hi)' }}>{`${spec.expect.compound}${spec.expect.tyreAge}`}</span>
                </span>
                {/* The safety car is the whole premise of one of these
                    scenarios, so it belongs in the situation line and not only
                    in the prose blurb. --caution is the race-control token and
                    measures 9.66:1 on --bg-panel; the warning glyph carries the
                    same signal without colour (CLAUDE.md §6.3). */}
                {spec.expect.safetyCarOut && (
                  <>
                    <span style={{ color: 'var(--line-hair)' }} aria-hidden>·</span>
                    <span style={{ color: 'var(--caution)' }}>{'\u26A0 SAFETY CAR'}</span>
                  </>
                )}
              </div>

              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
                color: 'var(--accent)', letterSpacing: '0.04em',
              }}>
                {`FINISH P${spec.goal.position} OR BETTER`}
              </div>

              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={(e) => { e.stopPropagation(); takeOver() }}
                style={{
                  width: '100%', border: 'none', borderRadius: 10, padding: '14px',
                  background: 'var(--accent)', color: 'var(--bg-deep)',
                  fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
                  letterSpacing: '0.08em', cursor: 'pointer', outline: 'none',
                }}
              >
                TAKE OVER
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function ScenarioSelect() {
  const uiTap = useUiTap()
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const exitScenarios = useSeasonStore(s => s.exitScenarios)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <motion.div
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 40 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -40 }}
      transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-deep)',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '20px 20px 14px', borderBottom: '1px solid var(--line-hair)', flexShrink: 0,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>
            SCENARIOS
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>
            Drop into a race already in progress.
          </div>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={() => { uiTap(); exitScenarios() }}
          style={{
            flexShrink: 0, background: 'var(--bg-elevated)', border: '1px solid var(--line-hair)',
            borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)', letterSpacing: '0.08em',
          }}
        >
          BACK
        </motion.button>
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SCENARIOS.map(spec => (
          <ScenarioCard
            key={spec.id}
            spec={spec}
            expanded={expandedId === spec.id}
            onToggle={() => setExpandedId(prev => (prev === spec.id ? null : spec.id))}
          />
        ))}
      </div>
    </motion.div>
  )
}
