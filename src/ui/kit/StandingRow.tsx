import type { ReactNode } from 'react'
export function StandingRow({ pos, teamColor, name, value, trailing, mine = false, bar }: {
  pos: ReactNode; teamColor: string; name: ReactNode; value: ReactNode; trailing?: ReactNode; mine?: boolean; bar?: number
}) {
  const cols = `28px 5px minmax(0, 1fr)${bar !== undefined ? ' 72px' : ''} auto${trailing !== undefined ? ' 26px' : ''}`
  return (
    <div data-standing-row className="slant-row" style={{
      display: 'grid', gridTemplateColumns: cols, gap: 10, alignItems: 'center', padding: '0 14px',
      height: mine ? 48 : 40, background: mine ? 'var(--volt)' : 'var(--grape)', color: mine ? 'var(--ink)' : 'var(--white)',
    }}>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 21 }}>{pos}</span>
      <span aria-hidden="true" style={{ height: 20, background: teamColor, transform: 'skewX(-14deg)' }} />
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 15, overflow: 'hidden', overflowWrap: 'anywhere' }}>{name}</span>
      {bar !== undefined && (
        <span aria-hidden="true" style={{ height: 8, background: mine ? 'rgba(var(--ink-rgb), 0.2)' : 'rgba(var(--white-rgb), 0.15)', position: 'relative' }}>
          <span style={{ position: 'absolute', inset: 0, width: `${Math.round(Math.max(0, Math.min(1, bar)) * 100)}%`, background: mine ? 'var(--ink)' : teamColor }} />
        </span>
      )}
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 15, textAlign: 'right' }}>{value}</span>
      {trailing !== undefined && <span>{trailing}</span>}
    </div>
  )
}
