import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { drawShareCard, buildShareData, SHARE_COLORS, SHARE_W, SHARE_H, type ShareCtx, type ShareCardData } from '@ui/share/shareCard'
import { loadGameData } from '@data/validators'

/** A recording 2D context: every fill with the fillStyle in force, every text with its font. */
function fake() {
  const fills: string[] = []
  const texts: { text: string; font: string; style: string; maxWidth?: number }[] = []
  const ctx = {
    fillStyle: '', font: '', textAlign: 'left', textBaseline: 'alphabetic',
    fillRect() { fills.push(String(ctx.fillStyle)) },
    fill() { fills.push(String(ctx.fillStyle)) },
    fillText(text: string, _x: number, _y: number, maxWidth?: number) { texts.push({ text, font: ctx.font, style: String(ctx.fillStyle), maxWidth }) },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
  }
  return { ctx: ctx as unknown as ShareCtx, fills, texts }
}
const GP: ShareCardData = { kind: 'gp', position: 3, label: 'BENGALURU GP · ROUND 1 · SEASON 2', points: 15, podium: ['ROS', 'BER', 'VOS'], teamColor: '#00E5D0' }

describe('share card (spec 1.6 §6)', () => {
  it('is 1080 x 1350', () => { expect([SHARE_W, SHARE_H]).toEqual([1080, 1350]) })

  it('draws the finish huge on a volt band, the label, points, podium codes and the wordmark', () => {
    const { ctx, fills, texts } = fake()
    drawShareCard(ctx, GP)
    const t = texts.map(x => x.text)
    expect(t).toContain('P3')
    expect(t).toContain('BENGALURU GP · ROUND 1 · SEASON 2')
    expect(t).toContain('+15 PTS')
    expect(t).toEqual(expect.arrayContaining(['1 ROS', '2 BER', '3 VOS', 'PIT WALL']))
    expect(fills).toContain(SHARE_COLORS.volt)
    expect(fills, 'the team colour slash').toContain('#00E5D0')
    expect(texts.find(x => x.text === 'P3')!.font).toMatch(/italic 900 \d+px "Big Shoulders Display"/)
    expect(texts.find(x => x.text === 'P3')!.style, 'ink on volt').toBe(SHARE_COLORS.ink)
  })

  it('A DNF: grape band, white DNF, NO POINTS', () => {
    const { ctx, fills, texts } = fake()
    drawShareCard(ctx, { ...GP, position: null, points: 0 })
    expect(fills).toContain(SHARE_COLORS.grape)
    const dnf = texts.find(x => x.text === 'DNF')!
    expect(dnf.style).toBe(SHARE_COLORS.white)
    expect(texts.map(x => x.text)).toContain('NO POINTS')
  })

  it('fewer than three classified: draws what there is and never "undefined"', () => {
    const { ctx, texts } = fake()
    drawShareCard(ctx, { ...GP, podium: ['ROS'] })
    expect(texts.map(x => x.text)).toContain('1 ROS')
    expect(texts.map(x => x.text).join(' ')).not.toMatch(/undefined|NaN/)
  })

  it('every line has a maxWidth, so a long circuit name cannot run off the card', () => {
    const { ctx, texts } = fake()
    drawShareCard(ctx, { ...GP, label: 'A VERY LONG CIRCUIT NAME GRAND PRIX · ROUND 12 · SEASON 14' })
    for (const x of texts) expect(x.maxWidth, x.text).toBeLessThanOrEqual(SHARE_W - 120)
  })

  it('the season card shows the total without a plus', () => {
    const { ctx, texts } = fake()
    drawShareCard(ctx, { ...GP, kind: 'season', points: 312, position: 1, label: 'SEASON 2 · CHAMPION' })
    expect(texts.map(x => x.text)).toContain('312 PTS')
  })

  it('SHARE_COLORS mirror tokens.css', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
    const hex = (n: string) => new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6})`).exec(css)?.[1]?.toUpperCase()
    const rgb = (n: string) => { const m = new RegExp(`--${n}-rgb:\\s*(\\d+),\\s*(\\d+),\\s*(\\d+)`).exec(css)!; return '#' + [m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase() }
    expect(SHARE_COLORS.ink).toBe(hex('ink'))
    expect(SHARE_COLORS.grape).toBe(hex('grape'))
    expect(SHARE_COLORS.white).toBe(hex('white'))
    expect(SHARE_COLORS.lilacDim).toBe(hex('lilac-dim'))
    expect(SHARE_COLORS.volt).toBe(rgb('volt'))
  })

  it('buildShareData: codes, team colour and labels', () => {
    const data = loadGameData()
    const voss = data.drivers.drivers.find(d => d.id === 'd_voss')!
    const team = data.cars.teams.find(t => t.id === voss.teamId)!
    const ids = data.drivers.drivers.slice(0, 3).map(d => d.id)
    const d = buildShareData({ kind: 'gp', finish: 3, circuitName: 'BENGALURU GP', round: 1, season: 2, points: 15, podiumIds: ids, playerDriverId: 'd_voss' })
    expect(d.podium).toEqual(data.drivers.drivers.slice(0, 3).map(x => x.code))
    expect(d.teamColor).toBe(team.colorPrimary)
    expect(d.label).toBe('BENGALURU GP · ROUND 1 · SEASON 2')
    expect(buildShareData({ kind: 'sprint', finish: 2, circuitName: 'SOL', round: 4, season: 1, points: 7, podiumIds: [], playerDriverId: 'd_voss' }).label).toBe('SOL · ROUND 4 · SPRINT')
    expect(buildShareData({ kind: 'season', finish: 1, season: 3, points: 300, podiumIds: [], playerDriverId: 'd_voss' }).label).toBe('SEASON 3 · CHAMPION')
    expect(buildShareData({ kind: 'season', finish: 4, season: 3, points: 200, podiumIds: [], playerDriverId: 'd_voss' }).label).toBe('SEASON 3 · FINAL STANDINGS')
  })
})

describe('renderShareCard fonts', () => {
  it('still renders when fonts.load rejects (fallback face)', async () => {
    const { renderShareCard } = await import('@ui/share/shareCard')
    const { vi } = await import('vitest')
    const orig = Object.getOwnPropertyDescriptor(document, 'fonts')
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load: () => Promise.reject(new Error('font')) } })
    const ctx = { fillStyle: '', font: '', textAlign: 'left', textBaseline: 'alphabetic', fillRect() {}, fill() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {} }
    const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['x'], { type: 'image/png' })) }
    const spy = vi.spyOn(document, 'createElement').mockReturnValueOnce(canvas as unknown as HTMLCanvasElement)
    try {
      const blob = await renderShareCard(GP)
      expect(blob.type).toBe('image/png')
      expect(canvas.width, 'backing store released after toBlob').toBe(0)
    } finally {
      spy.mockRestore()
      if (orig) Object.defineProperty(document, 'fonts', orig); else delete (document as unknown as { fonts?: unknown }).fonts
    }
  })
})
