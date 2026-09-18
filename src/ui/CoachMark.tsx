import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCoachStore, type CoachMarkId } from '@state/coachStore'
import { useSettingsStore } from '@state/settingsStore'
import { useClockStore, type GameSpeed } from '@state/clockStore'
import { useUiTap } from '@hooks/useUiTap'

interface Props { id: CoachMarkId; title: string; body: string }

/**
 * A single piece of first-race coaching.
 *
 * PAUSES THE RACE while it is up. A coach mark explains something that is
 * happening right now -- the cliff arriving, the projection appearing -- and a
 * race that keeps running while the player reads would make the explanation
 * describe a moment that has already passed. The previous speed is restored on
 * dismiss, so a player watching at 4x is not silently dropped to 1x.
 *
 * Deliberately NOT a modal dialog: it explains the screen behind it, so
 * covering that screen would defeat it. It is a labelled region with its own
 * dismiss control, announced politely rather than seizing focus, so a
 * screen-reader user is told about it without being yanked out of the race.
 */
export function CoachMark({ id, title, body }: Props) {
  const active = useCoachStore(s => s.active)
  const dismiss = useCoachStore(s => s.dismiss)
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const setSpeed = useClockStore(s => s.setSpeed)
  const uiTap = useUiTap()
  const showing = active === id
  const restoreRef = useRef<GameSpeed | null>(null)

  useEffect(() => {
    if (!showing) return
    restoreRef.current = useClockStore.getState().speed
    setSpeed(0)
    return () => {
      // Restore on unmount too, not only on dismiss -- a mark that is still up
      // when the race ends must not leave the clock paused forever.
      if (restoreRef.current !== null) setSpeed(restoreRef.current)
      restoreRef.current = null
    }
  }, [showing]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      {showing && (
        <motion.div
          role="region"
          aria-live="polite"
          aria-label={`Tip: ${title}`}
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'fixed',
            left: 16, right: 16,
            bottom: 'calc(16px + var(--safe-bottom))',
            /*
             * Above the pit drawer and the settings sheet, both zIndex 100.
             *
             * The projection mark's ONLY firing path is the pit panel having
             * computed a projection, so the drawer is open every time it
             * appears. At zIndex 90 it rendered underneath that opaque,
             * bottom-anchored drawer -- invisible 100% of the time it fired,
             * while still pausing the race and leaving GOT IT unreachable, so
             * coachMarksSeen could never flip. Below StartLights' 200, which is
             * a full-screen takeover that nothing should sit over.
             */
            zIndex: 120,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--accent)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,229,208,0.15)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 12,
            letterSpacing: '0.12em', color: 'var(--accent)',
            textTransform: 'uppercase',
          }}>
            {title}
          </div>
          {/*
            var(--text-hi) (#F2F5FF) on var(--bg-elevated) (#1B2238) measures
            14.47:1 -- clears WCAG AA's 4.5:1 for this 13px body text with
            enormous headroom.
          */}
          <div style={{
            fontFamily: 'var(--font-body)', fontSize: 13,
            color: 'var(--text-hi)', lineHeight: 1.5,
          }}>
            {body}
          </div>
          <button
            onClick={() => { uiTap(); dismiss(id) }}
            style={{
              alignSelf: 'flex-end',
              marginTop: 4,
              background: 'none',
              border: '1px solid var(--accent)',
              borderRadius: 6,
              color: 'var(--accent)',
              fontFamily: 'var(--font-display)',
              fontSize: 11,
              letterSpacing: '0.08em',
              padding: '6px 12px',
              cursor: 'pointer',
            }}
          >
            GOT IT
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
