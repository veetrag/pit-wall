import { useEffect, useRef } from 'react'
import * as PIXI from 'pixi.js'
import pathData from '@data/paths/silverpark.json'

type Point = [number, number]

function lerp(a: Point, b: Point, t: number): Point {
  return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t]
}

function getPointAlongPath(points: Point[], t: number): Point {
  if (points.length < 2) return points[0] ?? [0, 0]
  const totalSegments = points.length - 1
  const scaled = t * totalSegments
  const idx = Math.min(Math.floor(scaled), totalSegments - 1)
  const frac = scaled - idx
  return lerp(points[idx]!, points[idx + 1]!, frac)
}

export function TrackCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const app = new PIXI.Application()

    void app.init({
      width: 600,
      height: 500,
      background: 0x0A0E1A,
      antialias: true,
    }).then(() => {
      if (!containerRef.current) return
      containerRef.current.appendChild(app.canvas)

      const pts = pathData.points as Point[]

      // Draw track path
      const track = new PIXI.Graphics()
      track.moveTo(pts[0]![0], pts[0]![1])
      for (let i = 1; i < pts.length; i++) {
        track.lineTo(pts[i]![0], pts[i]![1])
      }
      track.stroke({ color: 0x2A3350, width: 3 })
      app.stage.addChild(track)

      // Car dot
      const car = new PIXI.Graphics()
      car.circle(0, 0, 6)
      car.fill({ color: 0x00E5D0 })
      app.stage.addChild(car)

      let progress = 0
      app.ticker.add((ticker) => {
        progress = (progress + ticker.deltaTime * 0.001) % 1
        const [x, y] = getPointAlongPath(pts, progress)
        car.x = x
        car.y = y
      })
    })

    return () => {
      app.destroy(true)
    }
  }, [])

  return <div ref={containerRef} style={{ width: 600, height: 500 }} />
}
