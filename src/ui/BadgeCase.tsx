import { useCareerStore } from '@state/careerStore'
import { BADGES, earnedBadges } from '@state/badges'

/**
 * The trophy case.
 *
 * Renders every badge, earned and unearned, and shows the CONDITION on the
 * locked ones -- a locked badge whose requirement is hidden is a mystery box
 * rather than something to chase.
 *
 * Earned state is carried by fill, border and an aria-label as well as
 * colour, because colour is never the only signal (CLAUDE.md 6.3).
 */
export function BadgeCase() {
  const record = useCareerStore()
  const earned = new Set(earnedBadges(record))

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)',
          letterSpacing: '0.15em',
        }}>
          TROPHY CASE
        </div>
        {/* Changes as badges are earned, so tabular figures stop it shifting. */}
        <div style={{
          fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
          fontSize: 11, color: 'var(--text-mid)',
        }}>
          {earned.size} / {BADGES.length}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {BADGES.map(b => {
          const got = earned.has(b.id)
          return (
            <div
              key={b.id}
              data-testid={`badge-${b.id}`}
              data-earned={got ? 'true' : 'false'}
              aria-label={`${b.name} — ${got ? 'earned' : `locked: ${b.condition}`}`}
              style={{
                borderRadius: 8, padding: '10px 12px',
                border: `1px solid ${got ? 'var(--accent)' : 'var(--line-hair)'}`,
                // A tint over an OPAQUE surface: a bare rgba() here would make
                // the panel translucent instead of tinting it. color-mix() is
                // banned -- Chromium 91 at minSdk 30 drops it silently.
                background: got
                  ? 'linear-gradient(rgba(var(--accent-rgb), 0.10), rgba(var(--accent-rgb), 0.10)), var(--bg-panel)'
                  : 'var(--bg-panel)',
              }}
            >
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
                color: got ? 'var(--accent)' : 'var(--text-dim)',
              }}>
                {b.name}
              </div>
              <div style={{
                fontFamily: 'var(--font-body)', fontSize: 10, marginTop: 2,
                color: got ? 'var(--text-mid)' : 'var(--text-dim)', lineHeight: 1.3,
              }}>
                {b.condition}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
