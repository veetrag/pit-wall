import { useEffect, useRef } from 'react'
import * as PIXI from 'pixi.js'
import { useRaceStore } from '@state/raceStore'
import pathData from '@data/paths/silverpark.json'
import type { RaceState, RaceConfig } from '@engine/types'

type Point = [number, number]

function lerp(a: Point, b: Point, t: number): Point {
  return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t]
}

function getPointAlongPath(points: Point[], t: number): Point {
  if (points.length < 2) return points[0] ?? [0, 0]
  const totalSegments = points.length - 1
  const scaled = (((t % 1) + 1) % 1) * totalSegments
  const idx = Math.min(Math.floor(scaled), totalSegments - 1)
  const frac = scaled - idx
  return lerp(points[idx]!, points[idx + 1]!, frac)
}

function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

const TEAM_HEX: Record<string, string> = {
  apex:     '#00E5D0',
  meridian: '#E8344E',
  vortex:   '#F2C94C',
  zenith:   '#7B5EA7',
  torque:   '#FF7A00',
}

function updateDots(
  app: PIXI.Application,
  dots: Map<string, PIXI.Graphics>,
  raceState: RaceState | null,
  config: RaceConfig | null,
) {
  if (!raceState || !config) return
  const pts = pathData.points as Point[]
  const [s0, s1, s2] = config.circuit.sectorBase
  const lapTime = (s0 ?? 28) + (s1 ?? 34) + (s2 ?? 28)

  raceState.cars.forEach(car => {
    let dot = dots.get(car.driverId)
    if (!dot) {
      dot = new PIXI.Graphics()
      app.stage.addChild(dot)
      dots.set(car.driverId, dot)
    }

    const hex = TEAM_HEX[car.teamId] ?? '#9AA7C7'
    const color = hexToNumber(hex)
    const radius = car.isPlayer ? 8 : 5

    dot.clear()
    if (car.isPlayer) {
      dot.circle(0, 0, radius + 4).fill({ color, alpha: 0.2 })
    }
    dot.circle(0, 0, radius).fill({ color })

    const progress = lapTime > 0 ? (car.raceTime % lapTime) / lapTime : 0
    const [x, y] = getPointAlongPath(pts, progress)
    dot.x = x
    dot.y = y
  })

  for (const [id, dot] of dots) {
    if (!raceState.cars.find(c => c.driverId === id)) {
      app.stage.removeChild(dot)
      dots.delete(id)
    }
  }
}

export function TrackCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const app = new PIXI.Application()
    const dots = new Map<string, PIXI.Graphics>()
    let alive = true
    let unsubStore: (() => void) | null = null

    app.init({ width: 600, height: 500, background: 0x0A0E1A, antialias: true })
      .then(() => {
        if (!alive) {
          // StrictMode cleanup ran before init finished — destroy orphaned app
          try { app.destroy(true) } catch { /* already destroyed */ }
          return
        }
        container.appendChild(app.canvas)

        // Draw static track
        const pts = pathData.points as Point[]
        const track = new PIXI.Graphics()
        track.moveTo(pts[0]![0], pts[0]![1])
        for (let i = 1; i < pts.length; i++) track.lineTo(pts[i]![0], pts[i]![1])
        track.stroke({ color: 0x2A3350, width: 3 })
        app.stage.addChild(track)

        // Draw current state immediately
        const { raceState, config } = useRaceStore.getState()
        updateDots(app, dots, raceState, config)

        // Subscribe to future updates
        unsubStore = useRaceStore.subscribe(state => {
          if (alive) updateDots(app, dots, state.raceState, state.config)
        })
      })
      .catch((err: unknown) => {
        if (alive) console.error('[TrackCanvas] init failed', err)
      })

    return () => {
      alive = false
      unsubStore?.()
      // app.canvas getter throws before init resolves (renderer not yet set).
      // Wrap in try-catch: if init was pending, the .then() callback handles destroy.
      try { app.destroy(true) } catch { /* init pending — .then() handles cleanup */ }
    }
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
