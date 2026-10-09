import { loadGameData } from '@data/validators'

type Livery = { primary: string; accent: string }
// Built on first call: loadGameData() re-parses and re-validates every JSON
// file, and liveryOf runs per row/per podium slot on every render.
let LIVERIES: Map<string, Livery> | null = null

export function liveryOf(teamId: string): Livery {
  if (!LIVERIES) {
    LIVERIES = new Map(loadGameData().cars.teams.map(t =>
      [t.id, { primary: t.colorPrimary, accent: t.liveryAccent ?? t.colorSecondary }] as [string, Livery]))
  }
  return LIVERIES.get(teamId) ?? { primary: 'var(--volt)', accent: 'var(--ink)' }
}

const ROT = { up: 0, right: 90, left: -90 } as const

export function CarArt({ primary, accent, height, heading = 'up', label }: {
  primary: string; accent: string; height: number; heading?: 'up' | 'left' | 'right'; label: string
}) {
  const w = (height * 120) / 300
  return (
    <svg role="img" aria-label={label} width={w} height={height} viewBox="0 0 120 300" style={{ transform: `rotate(${ROT[heading]}deg)`, flexShrink: 0 }}>
      <rect x="8" y="40" width="20" height="38" rx="6" fill="#06040F" /><rect x="92" y="40" width="20" height="38" rx="6" fill="#06040F" />
      <rect x="6" y="212" width="24" height="46" rx="7" fill="#06040F" /><rect x="90" y="212" width="24" height="46" rx="7" fill="#06040F" />
      <rect x="10" y="10" width="100" height="14" rx="4" fill={accent} />
      <path d="M54 22 L66 22 L71 112 L49 112 Z" fill={primary} />
      <path d="M44 108 Q38 150 32 188 L32 226 Q40 252 60 256 Q80 252 88 226 L88 188 Q82 150 76 108 Z" fill={primary} />
      <path d="M48 112 Q46 150 42 186 L60 196 L78 186 Q74 150 72 112 Z" fill={accent} />
      <ellipse cx="60" cy="148" rx="9" ry="17" fill="#06040F" />
      <rect x="56" y="168" width="8" height="82" rx="3" fill={accent} />
      <rect x="20" y="266" width="80" height="18" rx="4" fill={accent} />
    </svg>
  )
}
