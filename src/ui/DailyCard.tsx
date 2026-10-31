import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useDailyStore } from '@state/dailyStore'
import { useScenarioStore } from '@state/scenarioStore'
import { useSeasonStore } from '@state/seasonStore'
import { useSettingsStore } from '@state/settingsStore'
import { useUiTap } from '@hooks/useUiTap'
import { loadGameData } from '@data/validators'
import type { Compound } from '@engine/types'
import { Pill, TyreChip, KitButton, CircuitOutline, TraitPills, snapIn, EASE } from '@ui/kit'

const GAME = loadGameData()
const LONG = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' })
const SHORT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

/** The designed loading moment: a chevron sweeping a slanted strip, like a car on its formation lap. */
function DailyLoader({ failed, reducedMotion }: { failed: boolean; reducedMotion: boolean }) {
  return (
    <section className="slant-lg" aria-label={`Daily challenge for ${LONG.format(new Date())}`} aria-busy={!failed}
      style={{ background: 'var(--grape)', padding: '24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12, letterSpacing: 1.5, color: 'var(--lilac-dim)' }}>DAILY</div>
      <div role="status" style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 24, lineHeight: 1, textTransform: 'uppercase', color: failed ? 'var(--hot)' : 'var(--white)' }}>
        {failed ? "Today's challenge could not be built." : "Building today's challenge…"}
      </div>
      {!failed && (
        <div aria-hidden="true" className="slant-sm" style={{ position: 'relative', height: 6, background: 'var(--dusk)', overflow: 'hidden' }}>
          <motion.div
            style={{ position: 'absolute', top: 0, bottom: 0, width: '30%', background: 'var(--volt)' }}
            initial={reducedMotion ? { left: '35%', opacity: 0.5 } : { left: '-30%' }}
            animate={reducedMotion ? { opacity: 1 } : { left: '100%' }}
            transition={reducedMotion
              ? { duration: 0.6, repeat: Infinity, repeatType: 'reverse' }
              : { duration: 0.9, ease: EASE, repeat: Infinity }}
          />
        </div>
      )}
    </section>
  )
}

export function DailyCard() {
  const today = useDailyStore(s => s.today)
  const status = useDailyStore(s => s.status)
  const best = useDailyStore(s => (s.today ? s.bestFor(s.today) : null))
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const uiTap = useUiTap()
  useEffect(() => {
    const store = useDailyStore.getState()
    void store.loadBest()
    // Build once: never re-trigger while a build is in flight or already done
    // (StrictMode double-mounts and tab switches remount this card).
    if (store.status === 'idle' || store.status === 'failed') store.build()
  }, [])

  if (status !== 'ready' || !today) return <DailyLoader failed={status === 'failed'} reducedMotion={reducedMotion} />

  const d = today.spec
  const day = new Date(`${today.dateKey}T12:00:00`)
  const circuit = GAME.circuits[d.circuitId]
  const circuitName = circuit?.name ?? d.circuitId
  const driver = GAME.drivers.drivers.find(x => x.id === d.playerDriverId)
  const team = GAME.cars.teams.find(t => t.id === driver?.teamId)

  function play() {
    uiTap()
    useScenarioStore.getState().select(d)
    useSeasonStore.getState().startScenarioPhase()
  }

  return (
    <motion.section {...snapIn(reducedMotion, 0)} aria-label={`Daily challenge for ${LONG.format(day)}`} className="slant-lg"
      style={{ background: 'var(--grape)', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12, letterSpacing: 1.5, color: 'var(--lilac-dim)' }}>
            {`DAILY · ${SHORT.format(day).toUpperCase()}`}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 30, lineHeight: 1, textTransform: 'uppercase', color: 'var(--white)', overflowWrap: 'anywhere' }}>
            {circuitName}
          </div>
          <div style={{ marginTop: 4, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, color: 'var(--lilac)' }}>
            {`${driver?.name ?? ''} · ${team?.name ?? ''}`}
          </div>
        </div>
        <CircuitOutline circuitId={d.circuitId} width={72} height={56} label={`${circuitName} layout`} />
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--lilac)', lineHeight: 1.45 }}>{d.blurb}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Pill tone="dusk">{`P${d.expect.position}`}</Pill>
        <Pill tone="dusk">{`${d.expect.lapsRemaining} LAPS LEFT`}</Pill>
        <Pill tone="dusk"><TyreChip compound={d.expect.compound as Compound} size={20} /><span>{`${d.expect.compound}${d.expect.tyreAge}`}</span></Pill>
        {d.expect.safetyCarOut && <Pill tone="caution">{'⚠ SAFETY CAR'}</Pill>}
        {d.expect.vscOut && <Pill tone="caution">{'⚠ VSC'}</Pill>}
        <TraitPills circuitId={d.circuitId} />
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 15, letterSpacing: 1, color: 'var(--volt)' }}>
        {`FINISH P${d.goal.position} OR BETTER`}
      </div>
      <div aria-live="polite">
        {best && <Pill tone={best.met ? 'volt' : 'dusk'}>{`TODAY'S BEST ${best.position === null ? 'DNF' : `P${best.position}`}${best.met ? ' ✓' : ''}`}</Pill>}
      </div>
      <KitButton variant="primary" size="md" ariaLabel="Play the daily challenge" onClick={play}>PLAY</KitButton>
    </motion.section>
  )
}
