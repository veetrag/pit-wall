// Parametric racing helmet SVG — one component, data-driven for all 20 drivers.
// Pattern variants make teammates visually distinct within the same team livery.

export type HelmetPattern = 'stripe' | 'chevron' | 'halo' | 'solid'

interface HelmetAvatarProps {
  teamPrimary: string
  teamSecondary?: string
  pattern?: HelmetPattern
  number?: number
  size?: number
  selected?: boolean
  selectionColor?: string
  visor?: string
}

export function HelmetAvatar({
  teamPrimary,
  teamSecondary,
  pattern = 'stripe',
  number = 0,
  size = 52,
  selected = false,
  selectionColor,
  visor = 'var(--ink)',
}: HelmetAvatarProps) {
  const sec = teamSecondary ?? 'var(--ink)'
  const ring = selectionColor ?? teamPrimary

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ flexShrink: 0 }} aria-hidden>
      <path d="M8 38 Q8 10 34 8 Q58 8 58 34 L58 46 Q58 54 50 54 L18 54 Q8 54 8 46 Z" fill={teamPrimary} />
      {pattern === 'stripe' && <path d="M8 34 L58 30 L58 38 L8 42 Z" fill={sec} />}
      {pattern === 'chevron' && <path d="M8 44 L33 36 L58 44 L58 50 L33 42 L8 50 Z" fill={sec} />}
      {pattern === 'halo' && <path d="M14 20 Q34 8 54 20 L52 25 Q34 14 16 25 Z" fill={sec} />}
      <path d="M28 24 L56 22 Q58 30 56 30 L28 32 Q24 28 28 24 Z" fill={visor} />
      {number > 0 && (
        <text x="20" y="50" fontFamily="var(--font-body)" fontWeight={800} fontSize={12} fill="var(--ink)">{number}</text>
      )}
      {selected && <circle cx="32" cy="32" r="30.5" fill="none" stroke={ring} strokeWidth={3} />}
    </svg>
  )
}
