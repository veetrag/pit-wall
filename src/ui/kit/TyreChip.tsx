import type { Compound } from '@engine/types'
export const TYRE_COLOR: Record<Compound, string> = { S: 'var(--tyre-soft)', M: 'var(--tyre-medium)', H: 'var(--tyre-hard)', I: 'var(--tyre-inter)', W: 'var(--tyre-wet)' }
export const TYRE_NAME: Record<Compound, string> = { S: 'Soft', M: 'Medium', H: 'Hard', I: 'Intermediate', W: 'Wet' }
export function TyreChip({ compound, size = 26, onInk = true }: { compound: Compound; size?: number; onInk?: boolean }) {
  return <span role="img" aria-label={TYRE_NAME[compound]} style={{ width: size, height: size, borderRadius: 999, boxSizing: 'border-box',
    border: `${Math.max(2, Math.round(size / 9))}px solid ${onInk ? TYRE_COLOR[compound] : 'var(--ink)'}`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: Math.round(size * 0.45), color: onInk ? 'var(--white)' : 'var(--ink)' }}>
    <span aria-hidden="true">{compound}</span></span>
}
