import type { ReactNode } from 'react'
const TONE = {
  default: ['var(--grape)', 'var(--white)'], volt: ['var(--volt)', 'var(--ink)'],
  gain: ['var(--grape)', 'var(--gain)'], hot: ['var(--grape)', 'var(--hot)'],
} as const
export function StatTile({ value, label, tone = 'default' }: { value: ReactNode; label: string; tone?: keyof typeof TONE }) {
  const [bg, fg] = TONE[tone]
  return (
    <div className="slant-sm" style={{ background: bg, color: fg, padding: '10px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 28, lineHeight: 1 }}>{value}</span>
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 11, color: tone === 'volt' ? 'var(--ink)' : 'var(--lilac-dim)', textAlign: 'center' }}>{label}</span>
    </div>
  )
}
