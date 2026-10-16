import { motion, AnimatePresence } from 'framer-motion'
import { snapIn } from '@ui/kit'
import { useEffect } from 'react'
import { useCareerStore } from '@state/careerStore'
import { useSettingsStore } from '@state/settingsStore'
import { useHaptics } from '@hooks/useHaptics'
import { ImpactStyle } from '@capacitor/haptics'
import { BADGES } from '@state/badges'

/**
 * Announces badges earned by the race just finished.
 *
 * Reads justEarned, which careerStore computes as a set difference at the one
 * moment both the before and after records exist. That is why this fires once
 * without an `announced` flag to keep in sync, and why it does not re-fire
 * when the app is reopened -- justEarned is never saved.
 *
 * `ids`, when given, overrides justEarned. The result screen passes the
 * badges keeping the race WOULD award: a race is only recorded when the
 * player keeps it (seasonStore.keepResult), so at that screen justEarned
 * does not yet hold this race's badges.
 *
 * Haptic via useHaptics directly and NOT useUiTap: that helper also plays the
 * navTap sound, which is the acknowledgement of a press. A badge arriving is
 * not a press.
 */
export function BadgeToast({ ids, placement = 'overlay' }: {
  ids?: readonly string[]
  /**
   * 'overlay' floats over the bottom of the screen. 'inline' takes its own
   * space in the layout instead, for a screen whose pinned footer it would
   * otherwise cover (Championship: the toast does not time out there, and as
   * an overlay it hid NEXT SEASON, and END CAREER under it, for as long as the
   * player stayed).
   */
  placement?: 'overlay' | 'inline'
} = {}) {
  const storeEarned = useCareerStore(s => s.justEarned)
  const justEarned = ids ?? storeEarned
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const { impact } = useHaptics()

  // An id with no definition is ignored rather than rendered blank: the
  // post-race screen has no way out, so it must not crash on stale data.
  const earned = justEarned
    .map(id => BADGES.find(b => b.id === id))
    .filter((b): b is NonNullable<typeof b> => b !== undefined)

  // Keyed on the badge IDS, not the count: two consecutive single-badge
  // announcements (e.g. a race badge, then a title badge at the next
  // rollover) must not collapse into one silent haptic just because both
  // sets happen to have length 1 and the component stays mounted between them.
  const earnedKey = earned.map(b => b.id).join(',')

  useEffect(() => {
    if (earned.length > 0) void impact(ImpactStyle.Medium)
    // Fires once per distinct set of newly earned badges.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earnedKey, impact])

  if (earned.length === 0) return null

  return (
    <div style={{
      ...(placement === 'overlay'
        ? { position: 'absolute', left: 0, right: 0, bottom: 'calc(var(--safe-bottom) + 16px)', zIndex: 5 }
        : { flexShrink: 0, padding: '8px 0' }),
      display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
      pointerEvents: 'none',
    }}>
      <AnimatePresence>
        {earned.map((b, i) => (
          <motion.div
            key={b.id}
            className="slant-md"
            {...(() => { const e = snapIn(reducedMotion, i * 8); return { initial: e.initial, animate: e.animate, transition: e.transition } })()}
            exit={{ opacity: 0 }}
            // 32px sides, not 22: slant-md cuts 6% of the width at two corners,
            // up to ~19px on an 86%-wide tile, and 22px left the first and last
            // letters brushing the slant (1.4 phone pass).
            style={{ padding: '12px 32px', background: 'var(--volt)', color: 'var(--ink)', textAlign: 'center', maxWidth: '86%' }}
          >
            <div style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 11, letterSpacing: 2 }}>
              BADGE EARNED
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 22, lineHeight: 1.05, marginTop: 1 }}>
              {b.name}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
