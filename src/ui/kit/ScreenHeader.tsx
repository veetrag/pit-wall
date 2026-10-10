import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useUiTap } from '@hooks/useUiTap'
import { PRESS } from './motion'

export function ScreenHeader({ eyebrow, title, onBack, right }: { eyebrow?: string; title: string; onBack?: () => void; right?: ReactNode }) {
  const uiTap = useUiTap()
  return (
    <header style={{ padding: '12px 16px 0', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48 }}>
        {onBack && (
          <motion.button type="button" aria-label="Back" className="kit-focus" whileTap={{ scale: 0.96 }} transition={PRESS}
            onClick={() => { uiTap(); onBack() }}
            style={{ width: 48, height: 48, borderRadius: 999, border: 'none', background: 'var(--grape)', color: 'var(--white)',
              fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 20, cursor: 'pointer', flexShrink: 0 }}>←</motion.button>
        )}
        {eyebrow && <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, letterSpacing: 2, color: 'var(--lilac-dim)' }}>{eyebrow}</span>}
        {!eyebrow && <span style={{ flex: 1 }} />}
        {right && <div style={{ flexShrink: 0 }}>{right}</div>}
      </div>
      <h1 style={{ margin: '8px 0 0', fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 46,
        lineHeight: 0.95, textTransform: 'uppercase', color: 'var(--white)', overflowWrap: 'anywhere' }}>{title}</h1>
    </header>
  )
}
