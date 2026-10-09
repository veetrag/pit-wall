import { motion, AnimatePresence } from 'framer-motion'
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
export function BadgeToast({ ids }: { ids?: readonly string[] } = {}) {
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
      position: 'absolute', left: 0, right: 0, bottom: 'calc(var(--safe-bottom) + 16px)',
      display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
      pointerEvents: 'none', zIndex: 5,
    }}>
      <AnimatePresence>
        {earned.map((b, i) => (
          <motion.div
            key={b.id}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
            transition={{ delay: reducedMotion ? 0 : i * 0.35, duration: 0.3 }}
            style={{
              borderRadius: 10, padding: '10px 16px',
              border: '1px solid var(--accent)',
              background: 'linear-gradient(rgba(var(--accent-rgb), 0.12), rgba(var(--accent-rgb), 0.12)), var(--bg-elevated)',
              textAlign: 'center', maxWidth: '86%',
            }}
          >
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.2em',
              color: 'var(--text-dim)',
            }}>
              BADGE EARNED
            </div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
              color: 'var(--accent)', marginTop: 1,
            }}>
              {b.name}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
