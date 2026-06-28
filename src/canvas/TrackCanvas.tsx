import { useEffect, useRef } from 'react'
import * as PIXI from 'pixi.js'
import { useRaceStore } from '@state/raceStore'
import pathBengaluru from '@data/paths/bengaluru.json'
import pathMonsoonBay from '@data/paths/monsoon_bay.json'
import pathVeloce from '@data/paths/veloce.json'
import pathHarbourLights from '@data/paths/harbour_lights.json'
import pathSolDesert from '@data/paths/sol_desert.json'
import pathHighland from '@data/paths/highland.json'
import pathGrandSavane from '@data/paths/grand_savane.json'
import pathAurora from '@data/paths/aurora.json'
import pathSilverpark from '@data/paths/silverpark.json'
import type { RaceState, RaceConfig } from '@engine/types'

type Point = [number, number]

const CIRCUIT_PATHS: Record<string, { points: number[][]; sectorBoundaries: number[]; pitEntry: number[]; pitExit: number[] }> = {
  bengaluru:      pathBengaluru,
  monsoon_bay:    pathMonsoonBay,
  veloce:         pathVeloce,
  harbour_lights: pathHarbourLights,
  sol_desert:     pathSolDesert,
  highland:       pathHighland,
  grand_savane:   pathGrandSavane,
  aurora:         pathAurora,
  silverpark:     pathSilverpark,
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
  trail: PIXI.Graphics | null
  displayT: number   // lerped, used for rendering position
  targetT: number    // set on each sim tick
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
  const leaderProgress = lapTime > 0 ? (leader.raceTime % lapTime) / lapTime : 0

  for (const car of state.cars) {
    let ds = dotMap.get(car.driverId)
    const hex = TEAM_HEX[car.teamId] ?? '#9AA7C7'
    const color = hexToNum(hex)
    const isPlayer = car.isPlayer
    const radius = isPlayer ? 7 : 5

    if (!ds) {
      const gfx = new PIXI.Graphics()
      const trail = isPlayer ? new PIXI.Graphics() : null
      if (trail) app.stage.addChildAt(trail, 0)
      app.stage.addChild(gfx)
      ds = { gfx, trail, displayT: 0, targetT: 0 }
      dotMap.set(car.driverId, ds)
    }

    const gap = car.raceTime - leader.raceTime
    const gapFrac = lapTime > 0 ? gap / lapTime : 0
    const progress = ((leaderProgress - gapFrac) % 1 + 1) % 1
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
      if (ds.trail) app.stage.removeChild(ds.trail)
      dotMap.delete(id)
    }
  }
}

function drawTrack(
  graphics: PIXI.Graphics,
  arcTable: ReturnType<typeof buildArcTable>,
  transform: (p: Point) => Point,
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

  // Centreline (subtle)
  graphics.moveTo(x0, y0)
  for (let i = 1; i < tfPts.length; i++) graphics.lineTo(tfPts[i]![0], tfPts[i]![1])
  graphics.closePath()
  graphics.stroke({ color: 0x3A4A70, width: 1.5, alpha: 0.4 })
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

    const cw = container.clientWidth || 400
    const ch = container.clientHeight || 300

    app.init({ width: cw, height: ch, background: 0x0A0E1A, antialias: true })
      .then(() => {
        if (!alive) { try { app.destroy(true) } catch { /* */ }; return }
        app.canvas.style.width = '100%'
        app.canvas.style.height = '100%'
        container.appendChild(app.canvas)

        const { config: initConfig } = useRaceStore.getState()
        const circuitKey = initConfig?.circuit?.trackPath?.replace('paths/', '').replace('.json', '') ?? 'bengaluru'
        const activePath = CIRCUIT_PATHS[circuitKey] ?? CIRCUIT_PATHS['bengaluru']!
        const rawPts = activePath.points as Point[]
        arcTable = buildArcTable(rawPts, 600)
        transform = buildTransform(arcTable.pts, cw, ch)

        // Static layers
        const trackGfx = new PIXI.Graphics()
        const markerGfx = new PIXI.Graphics()
        app.stage.addChildAt(trackGfx, 0)
        app.stage.addChildAt(markerGfx, 1)
        drawTrack(trackGfx, arcTable, transform)
        drawMarkers(markerGfx, arcTable, transform)

        // Initial car draw
        const { raceState, config } = useRaceStore.getState()
        if (raceState && config && arcTable && transform) {
          updateCars(app, dotMap, arcTable, transform, raceState, config)
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
          for (const ds of dotMap.values()) {
            ds.displayT = lerpT(ds.displayT, ds.targetT, 0.12)
            const [wx, wy] = transform(sampleAt(arcTable, ds.displayT))
            ds.gfx.x = wx
            ds.gfx.y = wy
          }
        })

        unsub = useRaceStore.subscribe(state => {
          if (!alive || !arcTable || !transform) return
          if (state.raceState && state.config) {
            updateCars(app, dotMap, arcTable, transform, state.raceState, state.config)
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
