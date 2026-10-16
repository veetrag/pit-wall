import { neutralisationKind } from '@engine/incidents'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSafetyCar, useSafetyCarDeployCount } from '@hooks/useSafetyCar'
import { useSettingsStore } from '@state/settingsStore'
import { useHaptics } from '@hooks/useHaptics'

/**
 * Spec section 6, surface 1. Full width, above the timing tower.
 *
 * The banner is the signal for the whole feature -- the canvas wash and the
 * tower flash are atmosphere around it. So it carries the quality floor: the
 * literal words (colour is never the only signal), a countdown, one haptic per
 * deployment, a live region for screen readers, and a reduced-motion path that
 * drops the pulse without dropping any information.
 */
export function SafetyCarBanner() {
  const safetyCar = useSafetyCar()
  const deployCount = useSafetyCarDeployCount()
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const { warning } = useHaptics()

  // One buzz per DEPLOYMENT. Keyed on the count, not on `safetyCar` being
  // truthy: the latter re-fires on every sim tick for the whole period.
  const buzzedForRef = useRef(0)
  // Which deployment the screen reader has already been told about, so the
  // countdown updates that follow do not repeat the word "deployed".
  const announcedDeploymentRef = useRef(0)
  useEffect(() => {
    if (deployCount > buzzedForRef.current) {
      buzzedForRef.current = deployCount
      warning()
    }
    // Set AFTER the render that announced it: the effect runs post-render, so
    // the first render of a new deployment still reads the old value and says
    // "deployed", and every countdown render after it reads equal and does not.
    announcedDeploymentRef.current = deployCount
    // `warning` is recreated each render by useHaptics; deployCount is the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployCount])

  /*
   * The GREEN FLAG announcement, and why it lives outside the banner below.
   *
   * When the safety car comes in, `safetyCar` goes null and the whole banner --
   * live region included -- unmounts. A sighted player sees it disappear and
   * the field spread out, which is signal enough. A screen-reader user was told
   * the safety car deployed, told the countdown four or five times, and then
   * told nothing at all: the region simply stopped existing, which announces
   * nothing. They had no way to know racing had resumed.
   *
   * So this region is rendered unconditionally, as a sibling of the banner,
   * and carries text only for a few seconds after the transition.
   */
  const safetyCarOut = safetyCar != null
  const wasOutRef = useRef(false)
  const [greenFlag, setGreenFlag] = useState(false)
  useEffect(() => {
    const ended = wasOutRef.current && !safetyCarOut
    wasOutRef.current = safetyCarOut
    // Guards the false announcement at lights out, when there has been no
    // safety car to end: without the ref the first render would look like a
    // transition into green.
    if (!ended) return
    setGreenFlag(true)
    const timer = setTimeout(() => setGreenFlag(false), 5000)
    return () => clearTimeout(timer)
  }, [safetyCarOut])

  const laps = safetyCar?.lapsRemaining ?? 0
  const lapText = `${laps} LAP${laps === 1 ? '' : 'S'}`
  const isVsc = neutralisationKind(safetyCar) === 'vsc'
  const spokenName = isVsc ? 'Virtual safety car' : 'Safety car'

  return (
    <>
    <span
      role="status"
      data-testid="green-flag-status"
      style={{
        position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
        overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
      }}
    >
      {greenFlag ? 'Green flag. Racing resumes.' : ''}
    </span>
    <AnimatePresence>
      {safetyCar && (
        <motion.div
          key={isVsc ? 'vsc-banner' : 'sc-banner'}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.22 }}
          style={{ overflow: 'hidden', flexShrink: 0, margin: '8px 8px 0' }}
        >
          <motion.div
            // The "living gauge" language of CLAUDE.md 6.2: a slow throb, not a
            // static bar. Reduced motion pins it to the bright end -- the state
            // stays legible, only the movement goes.
            animate={reducedMotion ? { opacity: 1 } : { opacity: [1, 0.62, 1] }}
            transition={reducedMotion ? { duration: 0 } : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            className="slant-lg"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10, padding: '8px 22px', minHeight: 48,
              background: 'var(--caution)', color: 'var(--ink)',
              fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, fontStyle: 'italic',
              letterSpacing: 0.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
            }}
          >
            {/* --ink on --caution: dark text on amber, well above AA. The VSC
                carries a chip instead of the warning glyph so the two read
                apart without relying on colour. */}
            {isVsc ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 20 }}>
                <span style={{
                  background: 'var(--ink)', color: 'var(--caution)', borderRadius: 4, padding: '1px 6px',
                  fontSize: 14, fontStyle: 'normal', letterSpacing: 1,
                }}>VSC</span>
                VIRTUAL SAFETY CAR
              </span>
            ) : (
              <span>⚠ SAFETY CAR</span>
            )}
            <span>{lapText}</span>
          </motion.div>

          {/*
            Separate from the visual row on purpose. The row is a pulsing element
            with abbreviated, styled text; this is one calm sentence. Visually
            hidden rather than aria-label'd onto the row so the announcement can
            differ from the terse on-screen copy.

            POLITE, not assertive, and the distinction matters here. This text
            changes every lap as the countdown ticks, so an assertive region
            would interrupt whatever the screen reader was mid-sentence on, four
            or five times per deployment. Polite queues instead. `role="status"`
            already implies polite, so there is no aria-live attribute to set --
            an earlier version overrode it to assertive, which is why this
            comment exists.

            The word "deployed" is dropped after the first announcement for the
            same reason: repeating it each lap is noise, and the countdown alone
            is what has actually changed.
          */}
          <span
            role="status"
            data-testid="safety-car-status"
            style={{
              position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
              overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
            }}
          >
            {`${announcedDeploymentRef.current === deployCount ? spokenName : `${spokenName} deployed`}. ${laps} lap${laps === 1 ? '' : 's'} remaining.`}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  )
}
