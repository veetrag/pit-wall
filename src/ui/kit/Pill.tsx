import type { ReactNode } from 'react'
const TONE = { default: ['var(--grape)', 'var(--white)'], volt: ['var(--volt)', 'var(--ink)'], caution: ['var(--caution)', 'var(--ink)'] } as const
export function Pill({ children, tone = 'default', ariaLabel }: { children: ReactNode; tone?: keyof typeof TONE; ariaLabel?: string }) {
  const [bg, fg] = TONE[tone]
  return <span aria-label={ariaLabel} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: bg, color: fg,
    borderRadius: 999, padding: '7px 12px', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13 }}>{children}</span>
}
