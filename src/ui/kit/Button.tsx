import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useUiTap } from '@hooks/useUiTap'
import { useHaptics, ImpactStyle } from '@hooks/useHaptics'
import { useReducedMotion, PRESS } from './motion'

type Variant = 'primary' | 'urgent' | 'secondary'
const FILL: Record<Variant, string> = { primary: 'var(--volt)', urgent: 'var(--hot)', secondary: 'var(--grape)' }
const TEXT: Record<Variant, string> = { primary: 'var(--ink)', urgent: 'var(--ink)', secondary: 'var(--white)' }
const HEIGHT = { lg: 64, md: 52, sm: 48 } as const
const SLANT = { lg: 'slant-lg', md: 'slant-md', sm: 'slant-sm' } as const

/**
 * `haptic={false}` drops the kit's own tap feedback for a caller that fires a
 * stronger one itself (BOX NOW fires Heavy; Medium on top would double-buzz).
 */
export function KitButton({ variant, size = 'md', onClick, children, ariaLabel, disabled, display = true, haptic = true, style, testId }: {
  variant: Variant; size?: 'lg' | 'md' | 'sm'; onClick: () => void; children: ReactNode
  ariaLabel?: string; disabled?: boolean; display?: boolean; haptic?: boolean; style?: CSSProperties; testId?: string
}) {
  const uiTap = useUiTap()
  const { impact } = useHaptics()
  const reduced = useReducedMotion()
  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      data-testid={testId}
      disabled={disabled}
      className={`${SLANT[size]} kit-focus`}
      whileTap={reduced || disabled ? undefined : { scale: 0.96 }} transition={PRESS}
      onClick={() => {
        if (haptic) { if (variant === 'secondary') uiTap(); else impact(ImpactStyle.Medium) }
        onClick()
      }}
      style={{
        minHeight: HEIGHT[size], border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: FILL[variant], color: TEXT[variant], opacity: disabled ? 0.45 : 1,
        fontFamily: display ? 'var(--font-display)' : 'var(--font-body)',
        fontWeight: display ? 900 : 800, fontStyle: display ? 'italic' : 'normal',
        fontSize: display ? (size === 'lg' ? 30 : size === 'md' ? 24 : 18) : 15,
        textTransform: 'uppercase', letterSpacing: display ? 0.5 : 1, padding: '0 22px',
        ...style,
      }}
    >{children}</motion.button>
  )
}
