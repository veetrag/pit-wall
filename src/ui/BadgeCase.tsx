import { useCareerStore } from '@state/careerStore'
import { BADGES, earnedBadges } from '@state/badges'

/**
 * The badge wall.
 *
 * Renders every badge, earned and unearned, and shows the CONDITION on the
 * locked ones -- a locked badge whose requirement is hidden is a mystery box
 * rather than something to chase.
 *
 * Earned state is carried by fill (volt), a star glyph and an aria-label as
 * well as colour, because colour is never the only signal (CLAUDE.md 6.3).
 */
export function BadgeCase() {
  const record = useCareerStore()
  const earned = new Set(earnedBadges(record))

  return (
    <section aria-label="Badges" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, letterSpacing: 1, color: 'var(--lilac-dim)' }}>
          BADGES
        </h2>
        {/* Changes as badges are earned, so tabular figures stop it shifting. */}
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 16, color: 'var(--volt)', fontVariantNumeric: 'tabular-nums' }}>
          {earned.size} / {BADGES.length}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {BADGES.map(b => {
          const got = earned.has(b.id)
          return (
            <div
              key={b.id}
              className="slant-md"
              data-testid={`badge-${b.id}`}
              data-earned={got ? 'true' : 'false'}
              aria-label={`${b.name} — ${got ? 'earned' : `locked: ${b.condition}`}`}
              style={{
                minHeight: 92, padding: '10px 10px 8px', boxSizing: 'border-box',
                display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
                background: got ? 'var(--volt)' : 'var(--grape)',
                color: got ? 'var(--ink)' : 'var(--lilac-dim)',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>{got ? '★' : '◇'}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 16, lineHeight: 1.05, overflowWrap: 'anywhere' }}>
                {b.name}
              </span>
              {!got && (
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
                  {b.condition}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
