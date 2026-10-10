import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useReducedMotion, EASE } from './motion'

/**
 * Every screen's root. Opaque and absolutely stacked so a screen switch never
 * shows an empty frame: AnimatePresence runs in sync mode, the entering frame
 * sits above (zIndex 1) and snaps in, the exiting one holds fully visible
 * underneath (zIndex 0) for the same 180 ms, then unmounts (spec §5).
 */
export function ScreenFrame({ children, label, style }: { children: ReactNode; label: string; style?: CSSProperties }) {
  const reduced = useReducedMotion()
  return (
    <motion.section
      aria-label={label}
      initial={reduced ? { opacity: 0, zIndex: 1 } : { opacity: 0, x: -18, zIndex: 1 }}
      animate={reduced ? { opacity: 1, zIndex: 1 } : { opacity: 1, x: 0, zIndex: 1 }}
      exit={{ opacity: 1, zIndex: 0, transition: { duration: 0.18 } }}
      transition={{ duration: reduced ? 0.12 : 0.18, ease: EASE }}
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, background: 'var(--ink)', color: 'var(--white)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)', boxSizing: 'border-box',
        ...style,
      }}
    >{children}</motion.section>
  )
}
