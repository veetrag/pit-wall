import { useState, type CSSProperties } from 'react'
import { KitButton } from '@ui/kit'
import { renderShareCard, type ShareCardData } from './shareCard'
import { sharePng } from './sharePng'

/** SHARE (spec 1.6 §6). Renders the card on tap, never on mount. */
export function ShareButton({ build, fileName, style }: { build: () => ShareCardData; fileName: string; style?: CSSProperties }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const go = async () => {
    if (busy) return
    setBusy(true); setFailed(false)
    try {
      const outcome = await sharePng(await renderShareCard(build()), fileName, 'My Pit Wall result')
      setFailed(outcome === 'failed')
    } catch { setFailed(true) } finally { setBusy(false) }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      <KitButton variant="secondary" size="sm" ariaLabel="Share result card" disabled={busy} onClick={() => { void go() }} style={{ width: '100%' }}>
        {busy ? 'SHARING…' : 'SHARE'}
      </KitButton>
      <span aria-live="polite" style={{ fontSize: 12, color: 'var(--lilac-dim)', textAlign: 'center', minHeight: failed ? undefined : 0 }}>
        {failed ? "Couldn't share" : ''}
      </span>
    </div>
  )
}
