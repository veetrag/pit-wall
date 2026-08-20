import { useEffect, useRef } from 'react'
import * as PIXI from 'pixi.js'
import { useRaceStore } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'
import pathBengaluru from '@data/paths/bengaluru.json'
import pathMonsoonBay from '@data/paths/monsoon_bay.json'
import pathVeloce from '@data/paths/veloce.json'
import pathHarbourLights from '@data/paths/harbour_lights.json'
import pathSolDesert from '@data/paths/sol_desert.json'
import pathHighland from '@data/paths/highland.json'
import pathGrandSavane from '@data/paths/grand_savane.json'
import pathAurora from '@data/paths/aurora.json'
import pathSilverpark from '@data/paths/silverpark.json'
import pathCostaVerde from '@data/paths/costa_verde.json'
import pathKaido from '@data/paths/kaido.json'
import pathAltiplano from '@data/paths/altiplano.json'
import type { RaceState, RaceConfig, WeatherState } from '@engine/types'

type Point = [number, number]

export const CIRCUIT_PATHS: Record<string, { points: number[][]; sectorBoundaries: number[]; pitEntry: number[]; pitExit: number[] }> = {
  bengaluru:      pathBengaluru,
  monsoon_bay:    pathMonsoonBay,
  veloce:         pathVeloce,
  harbour_lights: pathHarbourLights,
  sol_desert:     pathSolDesert,
  highland:       pathHighland,
  grand_savane:   pathGrandSavane,
  aurora:         pathAurora,
  silverpark:     pathSilverpark,
  costa_verde:    pathCostaVerde,
  kaido:          pathKaido,
  altiplano:      pathAltiplano,
}

const TEAM_HEX: Record<string, string> = {
  apex:     '#00E5D0',
  meridian: '#E8344E',
  vortex:   '#F2C94C',
  kestrel:  '#9B6BFF',
  solstice: '#FF8A3D',
  delta:    '#3DDC84',
  halcyon:  '#5BC8FF',
  nimbus:   '#B0B6C8',
  terra:    '#C97B5A',
  zenith:   '#7A8290',
}

function hexToNum(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

// R2: per-circuit atmosphere wash — a subtle two-stop gradient behind the
// track plus a matching stroke tint, all within the dark-theme family so the
// HUD stays readable on top (CLAUDE.md §6.1). Weather cools/darkens it live.
const ATMOSPHERE_PALETTES: Record<string, { top: number; bottom: number; trackTint: number }> = {
  day:           { top: 0x141E38, bottom: 0x0A0E1A, trackTint: 0x3A4A70 },
  dusk:          { top: 0x241A38, bottom: 0x0A0E1A, trackTint: 0x4A3A66 },
  night:         { top: 0x060911, bottom: 0x020305, trackTint: 0x2A3350 },
  desert_night:  { top: 0x1E1420, bottom: 0x0A0E1A, trackTint: 0x5A3A2E },
  storm:         { top: 0x121A22, bottom: 0x05070A, trackTint: 0x2A3A3E },
  northern_dusk: { top: 0x0E2436, bottom: 0x0A0E1A, trackTint: 0x2A5A62 },
}
const STORM_COOL = 0x0A1018

function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bch = Math.round(ab + (bb - ab) * t)
  return (r << 16) | (g << 8) | bch
}

function weatherCoolFactor(weatherState: WeatherState): number {
  return weatherState === 'WET' ? 0.55 : weatherState === 'DAMP' ? 0.25 : 0
}

// Catmull-Rom point evaluation
function catmullRom(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const t2 = t * t, t3 = t2 * t
  return [
    0.5 * (2*p1[0] + (-p0[0]+p2[0])*t + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),
    0.5 * (2*p1[1] + (-p0[1]+p2[1])*t + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3),
  ]
}

function getCtrl(pts: Point[], i: number): Point {
  const n = pts.length - 1 // first === last for closed loop
  return pts[((i % n) + n) % n]!
}

// Build arc-length parameterized sample table from control points
function buildArcTable(ctrlPts: Point[], totalSamples = 600): { pts: Point[]; cumLen: number[]; totalLen: number } {
  const n = ctrlPts.length - 1
  const stepsPerSeg = Math.ceil(totalSamples / n)
  const pts: Point[] = []

  for (let seg = 0; seg < n; seg++) {
    const p0 = getCtrl(ctrlPts, seg - 1)
    const p1 = getCtrl(ctrlPts, seg)
    const p2 = getCtrl(ctrlPts, seg + 1)
    const p3 = getCtrl(ctrlPts, seg + 2)
    for (let j = 0; j < stepsPerSeg; j++) {
      pts.push(catmullRom(p0, p1, p2, p3, j / stepsPerSeg))
    }
  }
  pts.push(ctrlPts[0]!)

  const cumLen: number[] = [0]
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i]![0] - pts[i-1]![0]
    const dy = pts[i]![1] - pts[i-1]![1]
    cumLen.push(cumLen[i-1]! + Math.sqrt(dx*dx + dy*dy))
  }

  return { pts, cumLen, totalLen: cumLen[cumLen.length - 1]! }
}

function sampleAt(table: ReturnType<typeof buildArcTable>, fraction: number): Point {
  const { pts, cumLen, totalLen } = table
  const target = ((fraction % 1) + 1) % 1 * totalLen
  let lo = 0, hi = cumLen.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (cumLen[mid]! <= target) lo = mid; else hi = mid
  }
  const frac = (target - cumLen[lo]!) / ((cumLen[hi]! - cumLen[lo]!) || 1)
  const a = pts[lo]!, b = pts[hi]!
  return [a[0] + (b[0]-a[0])*frac, a[1] + (b[1]-a[1])*frac]
}

// Scale track points to fit canvas with padding
function buildTransform(pts: Point[], cw: number, ch: number, pad = 28): (p: Point) => Point {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  const scaleX = (cw - pad*2) / (maxX - minX || 1)
  const scaleY = (ch - pad*2) / (maxY - minY || 1)
  const scale = Math.min(scaleX, scaleY)
  const offX = (cw - (maxX - minX) * scale) / 2 - minX * scale
  const offY = (ch - (maxY - minY) * scale) / 2 - minY * scale
  return ([x, y]) => [x * scale + offX, y * scale + offY]
}

type DotState = {
  gfx: PIXI.Graphics
  trail: PIXI.Graphics
  flashGfx: PIXI.Graphics
  driverId: string
  isPlayer: boolean
  displayT: number   // lerped, used for rendering position
  targetT: number    // set on each sim tick
}

const FLASH_DURATION_FRAMES = 40 // ~0.65s at 60fps

// R4: rain particle pool — capped and reused, never allocated per frame.
type RainDrop = { x: number; y: number; len: number; speed: number; drift: number }
const MAX_RAIN_DROPS = 70
function makeRainPool(cw: number, ch: number): RainDrop[] {
  return Array.from({ length: MAX_RAIN_DROPS }, () => ({
    x: Math.random() * cw,
    y: Math.random() * ch,
    len: 8 + Math.random() * 10,
    speed: 6 + Math.random() * 5,
    drift: -1.5 - Math.random() * 1,
  }))
}
function rainDropCount(weatherState: WeatherState): number {
  return weatherState === 'WET' ? MAX_RAIN_DROPS : weatherState === 'DAMP' ? Math.round(MAX_RAIN_DROPS * 0.4) : 0
}

function lerpT(from: number, to: number, alpha: number): number {
  let dt = to - from
  if (dt > 0.5) dt -= 1
  if (dt < -0.5) dt += 1
  return ((from + dt * alpha) % 1 + 1) % 1
}

function updateCars(
  app: PIXI.Application,
  dotMap: Map<string, DotState>,
  arcTable: ReturnType<typeof buildArcTable>,
  transform: (p: Point) => Point,
  state: RaceState,
  config: RaceConfig,
) {
  const { s0, s1, s2 } = (() => {
    const [a, b, c] = config.circuit.sectorBase
    return { s0: a ?? 28, s1: b ?? 34, s2: c ?? 28 }
  })()
  const lapTime = s0 + s1 + s2

  const leader = [...state.cars].sort((a, b) => a.position - b.position)[0]
  if (!leader) return

  // Use car.lap as authoritative lap count to avoid raceTime drift over long races
  const getLapFrac = (c: { raceTime: number; lap: number }) =>
    lapTime > 0 ? Math.max(0, c.raceTime - c.lap * lapTime) / lapTime : 0

  const leaderProgress = getLapFrac(leader) % 1

  for (const car of state.cars) {
    let ds = dotMap.get(car.driverId)
    const hex = TEAM_HEX[car.teamId] ?? '#9AA7C7'
    const color = hexToNum(hex)
    const isPlayer = car.isPlayer
    const radius = isPlayer ? 7 : 5

    if (!ds) {
      const gfx = new PIXI.Graphics()
      const trail = new PIXI.Graphics()
      const flashGfx = new PIXI.Graphics()
      app.stage.addChildAt(trail, 0)
      app.stage.addChild(flashGfx)
      app.stage.addChild(gfx)
      ds = { gfx, trail, flashGfx, driverId: car.driverId, isPlayer, displayT: 0, targetT: 0 }
      dotMap.set(car.driverId, ds)
    }

    // Position relative to leader, accounting for lapped cars
    const carLapFrac = getLapFrac(car)
    const lapsBehind = leader.lap - car.lap
    const progress = ((carLapFrac - lapsBehind) % 1 + 1) % 1
    ds.targetT = progress

    // Redraw dot
    ds.gfx.clear()
    if (isPlayer) {
      // Outer glow ring
      ds.gfx.circle(0, 0, radius + 5).fill({ color: 0x00E5D0, alpha: 0.15 })
      ds.gfx.circle(0, 0, radius + 2).fill({ color: 0x00E5D0, alpha: 0.25 })
    }
    ds.gfx.circle(0, 0, radius).fill({ color })
    if (isPlayer) {
      // Bright core
      ds.gfx.circle(0, 0, 3).fill({ color: 0xFFFFFF, alpha: 0.8 })
    }
  }

  // Remove stale dots
  for (const [id, ds] of dotMap) {
    if (!state.cars.find(c => c.driverId === id)) {
      app.stage.removeChild(ds.gfx)
      app.stage.removeChild(ds.flashGfx)
      app.stage.removeChild(ds.trail)
      dotMap.delete(id)
    }
  }
}

function drawTrack(
  graphics: PIXI.Graphics,
  arcTable: ReturnType<typeof buildArcTable>,
  transform: (p: Point) => Point,
  trackTint = 0x3A4A70,
  wetSheenAlpha = 0,
) {
  graphics.clear()

  // Track shadow/outline
  const pts = arcTable.pts.filter((_, i) => i % 2 === 0)
  const tfPts = pts.map(p => transform(p))
  if (tfPts.length < 2) return

  // Outer glow layer
  const [x0, y0] = tfPts[0]!
  graphics.moveTo(x0, y0)
  for (let i = 1; i < tfPts.length; i++) graphics.lineTo(tfPts[i]![0], tfPts[i]![1])
  graphics.closePath()
  graphics.stroke({ color: 0x1E2B4A, width: 10, alpha: 0.6, cap: 'round', join: 'round' })

  // Main track line
  graphics.moveTo(x0, y0)
  for (let i = 1; i < tfPts.length; i++) graphics.lineTo(tfPts[i]![0], tfPts[i]![1])
  graphics.closePath()
  graphics.stroke({ color: 0x2A3350, width: 6, cap: 'round', join: 'round' })

  // Centreline — tinted per circuit atmosphere (R2)
  graphics.moveTo(x0, y0)
  for (let i = 1; i < tfPts.length; i++) graphics.lineTo(tfPts[i]![0], tfPts[i]![1])
  graphics.closePath()
  graphics.stroke({ color: trackTint, width: 1.5, alpha: 0.4 })

  // R4: wet track sheen — a bright, thin highlight over the racing line so a
  // damp/wet track visibly glistens, without needing animated particles.
  if (wetSheenAlpha > 0) {
    graphics.moveTo(x0, y0)
    for (let i = 1; i < tfPts.length; i++) graphics.lineTo(tfPts[i]![0], tfPts[i]![1])
    graphics.closePath()
    graphics.stroke({ color: 0x9AD8FF, width: 2, alpha: wetSheenAlpha, cap: 'round', join: 'round' })
  }
}

// R2: full-canvas two-stop gradient wash behind the track, cooling/darkening
// as weather worsens. Redrawn only when atmosphere/weather actually change,
// not per frame.
function drawAtmosphere(graphics: PIXI.Graphics, cw: number, ch: number, atmosphere: string, weatherState: WeatherState) {
  const palette = ATMOSPHERE_PALETTES[atmosphere] ?? ATMOSPHERE_PALETTES['day']!
  const cool = weatherCoolFactor(weatherState)
  const top = mixColor(palette.top, STORM_COOL, cool)
  const bottom = mixColor(palette.bottom, 0x000000, cool * 0.6)

  graphics.clear()
  const gradient = new PIXI.FillGradient({ start: { x: 0, y: 0 }, end: { x: 0, y: 1 } })
  gradient.addColorStop(0, top)
  gradient.addColorStop(1, bottom)
  graphics.rect(0, 0, cw, ch).fill(gradient)
}

// R6: rubber line — a faint, slowly-intensifying darker line on the racing
// line, visualising trackEvolution. Redrawn on state updates only.
function drawRubberLine(
  graphics: PIXI.Graphics,
  arcTable: ReturnType<typeof buildArcTable>,
  transform: (p: Point) => Point,
  evolutionFraction: number,
) {
  graphics.clear()
  if (evolutionFraction <= 0) return
  const pts = arcTable.pts.filter((_, i) => i % 2 === 0)
  const tfPts = pts.map(p => transform(p))
  if (tfPts.length < 2) return
  const [x0, y0] = tfPts[0]!
  graphics.moveTo(x0, y0)
  for (let i = 1; i < tfPts.length; i++) graphics.lineTo(tfPts[i]![0], tfPts[i]![1])
  graphics.closePath()
  graphics.stroke({ color: 0x000000, width: 3.5, alpha: Math.min(0.28, evolutionFraction * 0.28), cap: 'round', join: 'round' })
}

function drawMarkers(
  graphics: PIXI.Graphics,
  arcTable: ReturnType<typeof buildArcTable>,
  transform: (p: Point) => Point,
) {
  graphics.clear()

  // Start/finish line at t=0
  const sfPt = transform(sampleAt(arcTable, 0))
  const sfNear = transform(sampleAt(arcTable, 0.015))
  const dx = sfNear[0] - sfPt[0], dy = sfNear[1] - sfPt[1]
  const len = Math.sqrt(dx*dx + dy*dy) || 1
  const nx = -dy/len * 8, ny = dx/len * 8
  graphics.moveTo(sfPt[0] - nx, sfPt[1] - ny)
  graphics.lineTo(sfPt[0] + nx, sfPt[1] + ny)
  graphics.stroke({ color: 0xFFFFFF, width: 2, alpha: 0.8 })

  // Sector boundary ticks at ~1/3 and ~2/3
  for (const frac of [1/3, 2/3]) {
    const pt = transform(sampleAt(arcTable, frac))
    const nearPt = transform(sampleAt(arcTable, frac + 0.01))
    const ddx = nearPt[0] - pt[0], ddy = nearPt[1] - pt[1]
    const ll = Math.sqrt(ddx*ddx + ddy*ddy) || 1
    const nnx = -ddy/ll * 5, nny = ddx/ll * 5
    graphics.moveTo(pt[0] - nnx, pt[1] - nny)
    graphics.lineTo(pt[0] + nnx, pt[1] + nny)
    graphics.stroke({ color: 0x4A5A80, width: 1.5, alpha: 0.6 })
  }
}

export function TrackCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const app = new PIXI.Application()
    const dotMap = new Map<string, DotState>()
    let alive = true
    let unsub: (() => void) | null = null
    let arcTable: ReturnType<typeof buildArcTable> | null = null
    let transform: ((p: Point) => Point) | null = null

    const reducedMotion = useSettingsStore.getState().reducedMotion
    const rainPool = makeRainPool(1, 1) // resized once real canvas dims are known below

    // R6: overtake flash bookkeeping — a frame counter avoids any wall-clock API.
    let frameCounter = 0
    const flashExpiry = new Map<string, number>()
    let prevOvertakeCount = 0

    // R2/R4: redrawn only when atmosphere/weather actually change, not per frame.
    let lastAtmosphere = ''
    let lastWeather: WeatherState | '' = ''

    const cw = container.clientWidth || 400
    const ch = container.clientHeight || 300

    app.init({ width: cw, height: ch, background: 0x0A0E1A, antialias: true })
      .then(() => {
        if (!alive) { try { app.destroy(true) } catch { /* */ }; return }
        app.canvas.style.width = '100%'
        app.canvas.style.height = '100%'
        container.appendChild(app.canvas)

        rainPool.length = 0
        rainPool.push(...makeRainPool(cw, ch))

        const { config: initConfig } = useRaceStore.getState()
        const circuitKey = initConfig?.circuit?.trackPath?.replace('paths/', '').replace('.json', '') ?? 'bengaluru'
        const activePath = CIRCUIT_PATHS[circuitKey] ?? CIRCUIT_PATHS['bengaluru']!
        const rawPts = activePath.points as Point[]
        arcTable = buildArcTable(rawPts, 600)
        transform = buildTransform(arcTable.pts, cw, ch)

        // Layer order (back to front): atmosphere wash, track, rubber line,
        // markers, wet static overlay (reduced-motion only), cars, rain (front).
        const atmosphereGfx = new PIXI.Graphics()
        const trackGfx = new PIXI.Graphics()
        const rubberGfx = new PIXI.Graphics()
        const markerGfx = new PIXI.Graphics()
        const wetOverlayGfx = new PIXI.Graphics()
        const rainGfx = new PIXI.Graphics()
        app.stage.addChildAt(atmosphereGfx, 0)
        app.stage.addChildAt(trackGfx, 1)
        app.stage.addChildAt(rubberGfx, 2)
        app.stage.addChildAt(markerGfx, 3)
        app.stage.addChildAt(wetOverlayGfx, 4)
        drawMarkers(markerGfx, arcTable, transform)
        app.stage.addChild(rainGfx)

        const atmosphere = initConfig?.circuit?.atmosphere ?? 'day'
        const redrawAtmosphere = (weatherState: WeatherState) => {
          const palette = ATMOSPHERE_PALETTES[atmosphere] ?? ATMOSPHERE_PALETTES['day']!
          drawAtmosphere(atmosphereGfx, cw, ch, atmosphere, weatherState)
          drawTrack(trackGfx, arcTable!, transform!, palette.trackTint, weatherState === 'WET' ? 0.35 : weatherState === 'DAMP' ? 0.15 : 0)
          // Reduced motion: static wet tint instead of animated rain (R4)
          wetOverlayGfx.clear()
          if (reducedMotion && weatherState !== 'DRY') {
            const alpha = weatherState === 'WET' ? 0.07 : 0.035
            wetOverlayGfx.rect(0, 0, cw, ch).fill({ color: 0x1a2840, alpha })
          }
          lastAtmosphere = atmosphere
          lastWeather = weatherState
        }

        // Initial car draw
        const { raceState, config } = useRaceStore.getState()
        if (raceState && config && arcTable && transform) {
          updateCars(app, dotMap, arcTable, transform, raceState, config)
          redrawAtmosphere(raceState.weatherState)
          drawRubberLine(rubberGfx, arcTable, transform, raceState.trackEvolutionLaps / Math.max(1, config.tuning.trackEvolution.decayLaps))
          prevOvertakeCount = raceState.overtakeEvents.length
          // Snap displayT to targetT on first render
          for (const ds of dotMap.values()) {
            ds.displayT = ds.targetT
            const [wx, wy] = transform(sampleAt(arcTable, ds.displayT))
            ds.gfx.x = wx; ds.gfx.y = wy
          }
        }

        // t-lerp ticker: lerp in arc-length fraction space, handles wrap-around cleanly
        app.ticker.add(() => {
          if (!arcTable || !transform) return
          frameCounter++

          const currentWeather = useRaceStore.getState().raceState?.weatherState ?? 'DRY'
          const cars = useRaceStore.getState().raceState?.cars
          const leaderId = cars ? [...cars].sort((a, b) => a.position - b.position)[0]?.driverId : undefined

          for (const ds of dotMap.values()) {
            ds.displayT = lerpT(ds.displayT, ds.targetT, 0.12)
            const [wx, wy] = transform(sampleAt(arcTable, ds.displayT))
            ds.gfx.x = wx
            ds.gfx.y = wy

            // Trail: player always gets the teal identity trail; the current
            // race leader gets a light wet-spray trail in DAMP/WET (R4) —
            // "strongest for the leader in clean air".
            const isLeaderSpray = !ds.isPlayer && ds.driverId === leaderId && currentWeather !== 'DRY' && !reducedMotion
            if (ds.isPlayer || isLeaderSpray) {
              ds.trail.clear()
              const TRAIL_STEPS = ds.isPlayer ? 8 : 5
              const color = ds.isPlayer ? 0x00E5D0 : 0x9AD8FF
              const maxAlpha = ds.isPlayer ? 0.5 : 0.3
              for (let i = 1; i <= TRAIL_STEPS; i++) {
                const tBack = ((ds.displayT - i * 0.006) % 1 + 1) % 1
                const [tx, ty] = transform(sampleAt(arcTable, tBack))
                const alpha = (1 - i / TRAIL_STEPS) * maxAlpha
                const r = 3 * (1 - i / TRAIL_STEPS)
                ds.trail.circle(tx, ty, Math.max(0.5, r)).fill({ color, alpha })
              }
            } else {
              ds.trail.clear()
            }

            // R6: overtake flash — a brief bright pulse ring on both cars involved
            const flashEnd = flashExpiry.get(ds.driverId)
            ds.flashGfx.clear()
            if (flashEnd !== undefined && frameCounter < flashEnd) {
              const remaining = (flashEnd - frameCounter) / FLASH_DURATION_FRAMES
              const radius = 6 + (1 - remaining) * 10
              ds.flashGfx.circle(wx, wy, radius).stroke({ color: 0xFFD866, width: 2, alpha: remaining * 0.9 })
            } else if (flashEnd !== undefined) {
              flashExpiry.delete(ds.driverId)
            }
          }

          // R4: falling rain, pooled and capped — skipped entirely for reduced motion
          if (!reducedMotion) {
            const activeCount = rainDropCount(currentWeather)
            rainGfx.clear()
            if (activeCount > 0) {
              for (let i = 0; i < activeCount; i++) {
                const drop = rainPool[i]!
                drop.y += drop.speed
                drop.x += drop.drift
                if (drop.y > ch) { drop.y = -drop.len; drop.x = Math.random() * cw }
                if (drop.x < 0) drop.x = cw
                rainGfx.moveTo(drop.x, drop.y).lineTo(drop.x + drop.drift * 2, drop.y + drop.len)
                  .stroke({ color: 0x9AD8FF, width: 1, alpha: 0.35 })
              }
            }
          }
        })

        unsub = useRaceStore.subscribe(state => {
          if (!alive || !arcTable || !transform) return
          if (state.raceState && state.config) {
            updateCars(app, dotMap, arcTable, transform, state.raceState, state.config)

            if (state.raceState.weatherState !== lastWeather || lastAtmosphere !== atmosphere) {
              redrawAtmosphere(state.raceState.weatherState)
            }

            drawRubberLine(rubberGfx, arcTable, transform, state.raceState.trackEvolutionLaps / Math.max(1, state.config.tuning.trackEvolution.decayLaps))

            const newCount = state.raceState.overtakeEvents.length
            if (newCount > prevOvertakeCount) {
              for (let i = prevOvertakeCount; i < newCount; i++) {
                const ev = state.raceState.overtakeEvents[i]!
                flashExpiry.set(ev.overtakerId, frameCounter + FLASH_DURATION_FRAMES)
                flashExpiry.set(ev.overtakenId, frameCounter + FLASH_DURATION_FRAMES)
              }
            }
            prevOvertakeCount = newCount
          }
        })
      })
      .catch((err: unknown) => { if (alive) console.error('[TrackCanvas]', err) })

    return () => {
      alive = false
      unsub?.()
      try { app.destroy(true) } catch { /* */ }
    }
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
