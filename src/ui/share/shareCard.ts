import { loadGameData } from '@data/validators'

/** The share PNG (spec 1.6 §6): 1080 x 1350, a 4:5 portrait that every share target accepts. */
export const SHARE_W = 1080
export const SHARE_H = 1350

/**
 * Canvas cannot read CSS custom properties, so the card's colours are the
 * Race Day Bold tokens MIRRORED here and pinned to tokens.css by
 * tests/ui/shareCard.test.ts. Always the standard palette: the card is for
 * other people, not a per-player accessibility view.
 */
export const SHARE_COLORS = { ink: '#120E2B', grape: '#2A2160', volt: '#FFD60A', white: '#FFFFFF', lilacDim: '#A99FDB' } as const

const DISPLAY = '"Big Shoulders Display"'
const BODY = 'Barlow'
const PAD = 120
const MAX = SHARE_W - PAD   // every fillText gets a maxWidth: a long name shrinks, never runs off

export interface ShareCardData {
  kind: 'gp' | 'sprint' | 'season'
  /** null = DNF. */
  position: number | null
  label: string
  points: number
  /** Driver codes, P1 first; up to three. */
  podium: string[]
  teamColor: string
}

export type ShareCtx = Pick<CanvasRenderingContext2D,
  'fillStyle' | 'font' | 'textAlign' | 'textBaseline' | 'fillRect' | 'fillText' | 'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'fill'>

export function buildShareData(i: {
  kind: ShareCardData['kind']; finish: number | null; circuitName?: string; round?: number; season: number
  points: number; podiumIds: readonly string[]; playerDriverId: string | null
}): ShareCardData {
  const data = loadGameData()
  const code = (id: string) => data.drivers.drivers.find(d => d.id === id)?.code ?? id.replace('d_', '').slice(0, 3).toUpperCase()
  const teamId = data.drivers.drivers.find(d => d.id === i.playerDriverId)?.teamId
  const teamColor = data.cars.teams.find(t => t.id === teamId)?.colorPrimary ?? SHARE_COLORS.grape
  const label = i.kind === 'season'
    ? `SEASON ${i.season} · ${i.finish === 1 ? 'CHAMPION' : 'FINAL STANDINGS'}`
    : i.kind === 'sprint'
      ? `${i.circuitName ?? ''} · ROUND ${i.round ?? 0} · SPRINT`
      : `${i.circuitName ?? ''} · ROUND ${i.round ?? 0} · SEASON ${i.season}`
  return { kind: i.kind, position: i.finish, label, points: i.points, podium: i.podiumIds.slice(0, 3).map(code), teamColor }
}

function poly(ctx: ShareCtx, pts: readonly [number, number][]) {
  ctx.beginPath()
  pts.forEach(([x, y], k) => (k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  ctx.closePath()
  ctx.fill()
}

export function drawShareCard(ctx: ShareCtx, d: ShareCardData): void {
  const dnf = d.position === null
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = SHARE_COLORS.ink
  ctx.fillRect(0, 0, SHARE_W, SHARE_H)
  // Team colour slash down the left edge (the one forward slant).
  ctx.fillStyle = d.teamColor
  poly(ctx, [[0, 0], [84, 0], [36, SHARE_H], [0, SHARE_H]])
  // Hero band: volt, or grape on a DNF (a retirement is not a celebration).
  ctx.fillStyle = dnf ? SHARE_COLORS.grape : SHARE_COLORS.volt
  poly(ctx, [[0, 150], [SHARE_W, 90], [SHARE_W, 770], [0, 830]])

  const onBand = dnf ? SHARE_COLORS.white : SHARE_COLORS.ink
  ctx.fillStyle = onBand
  ctx.font = `800 40px ${BODY}`
  ctx.fillText(d.label, PAD, 270, MAX - PAD)
  ctx.font = `italic 900 440px ${DISPLAY}`
  ctx.fillText(dnf ? 'DNF' : `P${d.position}`, PAD - 10, 660, MAX - PAD)
  ctx.font = `italic 900 100px ${DISPLAY}`
  ctx.fillText(d.kind === 'season' ? `${d.points} PTS` : d.points > 0 ? `+${d.points} PTS` : 'NO POINTS', PAD, 750, MAX - PAD)

  if (d.podium.length > 0) {
    ctx.fillStyle = SHARE_COLORS.lilacDim
    ctx.font = `800 34px ${BODY}`
    ctx.fillText(d.kind === 'season' ? 'TOP THREE' : 'PODIUM', PAD, 930, MAX - PAD)
    ctx.fillStyle = SHARE_COLORS.white
    ctx.font = `italic 900 84px ${DISPLAY}`
    d.podium.forEach((c, k) => ctx.fillText(`${k + 1} ${c}`, PAD + k * 300, 1020, 280))
  }

  ctx.fillStyle = SHARE_COLORS.volt
  ctx.font = `italic 900 96px ${DISPLAY}`
  ctx.fillText('PIT WALL', PAD, 1250, MAX - PAD)
}

/** The self-hosted faces must be loaded before drawing, or the canvas silently falls back to sans. */
export async function loadShareFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return
  await Promise.all([
    document.fonts.load(`italic 900 100px ${DISPLAY}`),
    document.fonts.load(`800 40px ${BODY}`),
  ])
}

export async function renderShareCard(d: ShareCardData): Promise<Blob> {
  await loadShareFonts()
  const canvas = document.createElement('canvas')
  canvas.width = SHARE_W
  canvas.height = SHARE_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('share card: no 2d context')
  drawShareCard(ctx, d)
  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('share card: toBlob failed'))), 'image/png'))
}
