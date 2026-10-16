import type { RivalIntel } from '@engine/rivalIntel'
import { TyreChip, TYRE_NAME } from '@ui/kit'

/** The card's status line. The brain behind the window is never named. */
export function intelStatusText(intel: RivalIntel): string {
  switch (intel.status) {
    case 'window': return intel.from === intel.to ? `BOX WINDOW L${intel.from}` : `BOX WINDOW L${intel.from}–${intel.to}`
    case 'flag': return 'RUNNING TO THE FLAG'
    case 'out': return 'OUT'
    default: { const never: never = intel; return never }
  }
}

/** The row's accessible name: the whole card, read aloud. */
export function intelAriaLabel(intel: RivalIntel, code: string): string {
  const age = `${intel.tyreAge} lap${intel.tyreAge === 1 ? '' : 's'} old`
  const stops = `${intel.stops} stop${intel.stops === 1 ? '' : 's'}`
  let tail: string
  switch (intel.status) {
    case 'window': tail = intel.from === intel.to ? `box window lap ${intel.from}` : `box window lap ${intel.from} to ${intel.to}`; break
    case 'flag': tail = 'running to the flag'; break
    case 'out': tail = 'out'; break
    default: { const never: never = intel; return never }
  }
  return `Rival intel: ${code}, ${TYRE_NAME[intel.compound].toLowerCase()}, ${age}, ${stops}, ${tail}`
}

/**
 * Slanted grape panel, one row tall plus a line (spec 2026-10-16 §2). Polite
 * live region: it updates in place once a lap, and a stop or a retirement
 * should be heard without interrupting.
 */
export function RivalIntelCard({ intel, code, teamColor }: { intel: RivalIntel; code: string; teamColor: string }) {
  const num = { fontVariantNumeric: 'tabular-nums' as const }
  return (
    <div role="region" aria-label="Rival intel" aria-live="polite" data-testid="rival-intel" className="slant-lg"
      style={{
        background: 'var(--grape)', color: 'var(--white)', padding: '8px 22px', minHeight: 56, boxSizing: 'border-box',
        display: 'grid', gridTemplateColumns: '5px auto 1fr auto', alignItems: 'center', columnGap: 10, rowGap: 2,
      }}>
      <span aria-hidden="true" style={{ gridRow: '1 / 3', width: 5, height: 36, transform: 'skewX(-14deg)', background: teamColor }} />
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 22, lineHeight: 1 }}>{code}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 13, ...num }}>
        <TyreChip compound={intel.compound} size={22} />
        {`${intel.tyreAge} LAP${intel.tyreAge === 1 ? '' : 'S'}`}
      </span>
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 13, textAlign: 'right', ...num }}>
        {`${intel.stops} STOP${intel.stops === 1 ? '' : 'S'}`}
      </span>
      <span style={{
        gridColumn: '2 / 5', fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12, letterSpacing: 1, ...num,
        // --hot and --lilac both clear 4.5:1 on --grape.
        color: intel.status === 'out' ? 'var(--hot)' : 'var(--lilac)',
      }}>{intelStatusText(intel)}</span>
    </div>
  )
}
