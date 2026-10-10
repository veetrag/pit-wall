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
}

export function HelmetAvatar({
  teamPrimary,
  teamSecondary,
  pattern = 'stripe',
  number = 0,
  size = 52,
  selected = false,
  selectionColor,
}: HelmetAvatarProps) {
  const sec = teamSecondary ?? '#120E2B'
  const ring = selectionColor ?? teamPrimary
  const id = `h${teamPrimary.replace('#', '')}${pattern}${number}`

  return (
    <svg
      width={size} height={size}
      viewBox="0 0 56 56"
      style={{
        flexShrink: 0,
        filter: selected ? `drop-shadow(0 0 7px ${ring}99)` : 'none',
        transition: 'filter 0.2s',
      }}
      aria-hidden
    >
      <defs>
        <radialGradient id={`base_${id}`} cx="38%" cy="28%" r="70%">
          <stop offset="0%" stopColor={teamPrimary} stopOpacity="0.85" />
          <stop offset="100%" stopColor={sec} />
        </radialGradient>
        <clipPath id={`clip_${id}`}>
          <ellipse cx="28" cy="28" rx="25" ry="25" />
        </clipPath>
      </defs>

      {/* Helmet dome */}
      <ellipse cx="28" cy="28" rx="25" ry="25" fill={`url(#base_${id})`} />

      {/* Pattern overlay */}
      {pattern === 'stripe' && (
        <g clipPath={`url(#clip_${id})`}>
          <rect x="22" y="0" width="5" height="56" fill={teamPrimary} opacity="0.55" />
          <rect x="29" y="0" width="2" height="56" fill="rgba(255,255,255,0.18)" />
        </g>
      )}
      {pattern === 'chevron' && (
        <g clipPath={`url(#clip_${id})`}>
          <polygon points="28,8 46,28 28,24 10,28" fill={teamPrimary} opacity="0.5" />
          <polygon points="28,16 40,28 28,26 16,28" fill="rgba(255,255,255,0.15)" />
        </g>
      )}
      {pattern === 'halo' && (
        <g clipPath={`url(#clip_${id})`}>
          <ellipse cx="28" cy="22" rx="18" ry="6" fill="none" stroke={teamPrimary} strokeWidth="3" opacity="0.6" />
        </g>
      )}
      {/* 'solid' has no overlay — base gradient only */}

      {/* Dome highlight */}
      <ellipse cx="20" cy="17" rx="9" ry="6" fill="rgba(255,255,255,0.11)" />

      {/* Visor */}
      <rect x="8" y="27" width="40" height="13" rx="5"
        fill="rgba(20,30,50,0.88)" clipPath={`url(#clip_${id})`} />
      {/* Visor mirror sheen */}
      <rect x="8" y="27" width="40" height="5" rx="5"
        fill="rgba(255,255,255,0.07)" clipPath={`url(#clip_${id})`} />

      {/* Chin guard */}
      <ellipse cx="28" cy="50" rx="17" ry="8" fill={sec} clipPath={`url(#clip_${id})`} />

      {/* Driver number */}
      <text
        x="28" y="23"
        textAnchor="middle"
        fontFamily="monospace"
        fontWeight="bold"
        fontSize={number > 9 ? '10' : '12'}
        fill="rgba(255,255,255,0.82)"
        letterSpacing="-0.5"
      >
        {number > 0 ? number : ''}
      </text>

      {/* Team colour crown stripe */}
      <rect x="18" y="3" width="20" height="4" rx="2" fill={teamPrimary} opacity="0.9" clipPath={`url(#clip_${id})`} />

      {/* Selection ring */}
      {selected && (
        <ellipse cx="28" cy="28" rx="25" ry="25" fill="none" stroke={ring} strokeWidth="2.5" />
      )}
    </svg>
  )
}
