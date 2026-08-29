import { useEffect, useRef } from 'react'
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
  useEffect(() => {
    if (deployCount > buzzedForRef.current) {
      buzzedForRef.current = deployCount
      warning()
    }
    // `warning` is recreated each render by useHaptics; deployCount is the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployCount])

  const laps = safetyCar?.lapsRemaining ?? 0
  const lapText = `${laps} LAP${laps === 1 ? '' : 'S'}`

  return (
    <AnimatePresence>
      {safetyCar && (
        <motion.div
          key="sc-banner"
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
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10, padding: '8px 14px', borderRadius: 8,
              background: 'var(--caution)',
              border: '1px solid var(--caution)',
            }}
          >
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
              // --bg-deep on --caution measures 10.53:1.
              color: 'var(--bg-deep)', letterSpacing: '0.14em', whiteSpace: 'nowrap',
            }}>
              ⚠ SAFETY CAR
            </span>
            <span className="mono" style={{
              fontSize: 12, fontWeight: 700, color: 'var(--bg-deep)',
              letterSpacing: '0.06em', whiteSpace: 'nowrap',
            }}>
              {lapText}
            </span>
          </motion.div>

          {/*
            Separate from the visual row on purpose. The row is a pulsing element
            with abbreviated, styled text; this is one calm sentence, announced
            once per change. Visually hidden rather than aria-label'd onto the row
            so the announcement can differ from the terse on-screen copy.
          */}
          <span
            role="status"
            aria-live="assertive"
            style={{
              position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
              overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
            }}
          >
            {`Safety car deployed. ${laps} lap${laps === 1 ? '' : 's'} remaining.`}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
