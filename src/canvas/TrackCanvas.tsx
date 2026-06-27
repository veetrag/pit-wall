import { useEffect, useRef } from 'react'
import * as PIXI from 'pixi.js'
import { useRaceStore } from '@state/raceStore'
import pathData from '@data/paths/silverpark.json'

type Point = [number, number]

function lerp(a: Point, b: Point, t: number): Point {
  return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t]
}

function getPointAlongPath(points: Point[], t: number): Point {
  if (points.length < 2) return points[0] ?? [0, 0]
  const totalSegments = points.length - 1
  const scaled = ((t % 1) + 1) % 1 * totalSegments
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

export function TrackCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXI.Application | null>(null)
  const dotsRef = useRef<Map<string, PIXI.Graphics>>(new Map())

  const raceState = useRaceStore(s => s.raceState)
  const config = useRaceStore(s => s.config)

  useEffect(() => {
    if (!containerRef.current) return
    const app = new PIXI.Application()
    appRef.current = app

    void app.init({ width: 600, height: 500, background: 0x0A0E1A, antialias: true }).then(() => {
      if (!containerRef.current) return
      containerRef.current.appendChild(app.canvas)

      const pts = pathData.points as Point[]
      const track = new PIXI.Graphics()
      track.moveTo(pts[0]![0], pts[0]![1])
      for (let i = 1; i < pts.length; i++) track.lineTo(pts[i]![0], pts[i]![1])
      track.stroke({ color: 0x2A3350, width: 3 })
      app.stage.addChild(track)
    })

    return () => {
      app.destroy(true)
      appRef.current = null
      dotsRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const app = appRef.current
    if (!app || !raceState || !config) return

    const pts = pathData.points as Point[]
    const [s0, s1, s2] = config.circuit.sectorBase
    const lapTime = (s0 ?? 28) + (s1 ?? 34) + (s2 ?? 28)

    raceState.cars.forEach(car => {
      let dot = dotsRef.current.get(car.driverId)
      if (!dot) {
        dot = new PIXI.Graphics()
        app.stage.addChild(dot)
        dotsRef.current.set(car.driverId, dot)
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

    // Remove stale dots
    for (const [id, dot] of dotsRef.current) {
      if (!raceState.cars.find(c => c.driverId === id)) {
        app.stage.removeChild(dot)
        dotsRef.current.delete(id)
      }
    }
  }, [raceState, config])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
