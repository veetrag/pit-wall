import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { Compound } from '@engine/types'
import { TYRE_COLOR, TYRE_NAME } from '@ui/kit'

/** Minimum laps required between two planned stops (and from a stop to the flag). */
export const MIN_STINT_GAP = 4

/**
 * The planned-stop limits the setup sliders always used, now named: stop 1
 * from lap 5 to laps-3 (leaving a stint gap for stop 2 when there are two),
 * stop 2 from a stint gap after stop 1 to laps-2.
 */
export function stopBounds(laps: number, stopCount: 1 | 2, pitLap1: number): { min1: number; max1: number; min2: number; max2: number } {
  return {
    min1: 5,
    max1: stopCount === 2 ? laps - 3 - MIN_STINT_GAP : laps - 3,
    min2: pitLap1 + MIN_STINT_GAP,
    max2: laps - 2,
  }
}

type Stop = { lap: number; compound: Compound }

function boundsFor(laps: number, stops: Stop[], index: number): [number, number] {
  const b = stopBounds(laps, stops.length >= 2 ? 2 : 1, stops[0]?.lap ?? 0)
  return index === 0 ? [b.min1, b.max1] : [b.min2, b.max2]
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * The race plan as one bar: a segment per stint (width = laps in it, filled
 * with its tyre colour) and a draggable, keyboard-operable split per stop.
 * Clamps exactly like the sliders it replaces; calls onChange only on a real move.
 */
export function StintBar({ laps, startCompound, stops, onChange }: {
  laps: number; startCompound: Compound; stops: Stop[]; onChange: (index: number, lap: number) => void
}) {
  const barRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)

  const stints = [startCompound, ...stops.map(s => s.compound)].map((compound, i) => {
    const from = i === 0 ? 1 : (stops[i - 1]?.lap ?? 0) + 1
    const to = stops[i]?.lap ?? laps
    return { compound, from, to }
  })
  const label = 'Stint plan: ' + stints.map((s, i) =>
    i === stints.length - 1 && i > 0 ? `${TYRE_NAME[s.compound]} to the flag` : `${TYRE_NAME[s.compound]} laps ${s.from} to ${s.to}`,
  ).join(', then ')

  const move = (index: number, candidate: number) => {
    const current = stops[index]?.lap
    if (current === undefined) return
    const [lo, hi] = boundsFor(laps, stops, index)
    const next = clamp(candidate, lo, hi)
    if (next !== current) onChange(index, next)
  }

  const onKeyDown = (index: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    const current = stops[index]?.lap
    if (current === undefined) return
    const [lo, hi] = boundsFor(laps, stops, index)
    let target: number
    switch (e.key) {
      case 'ArrowLeft': case 'ArrowDown': target = current - 1; break
      case 'ArrowRight': case 'ArrowUp': target = current + 1; break
      case 'PageDown': target = current - 5; break
      case 'PageUp': target = current + 5; break
      case 'Home': target = lo; break
      case 'End': target = hi; break
      default: return
    }
    e.preventDefault()
    move(index, target)
  }

  /** Pointer x as a fractional lap over the bar width (null if the bar has no size). */
  const lapAtExact = (clientX: number): number | null => {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return null
    return ((clientX - rect.left) / rect.width) * laps
  }

  // The ref is the source of truth (a move can arrive before React re-renders);
  // the state only drives the grip's pressed look.
  const draggingRef = useRef<number | null>(null)
  const setDrag = (i: number | null) => { draggingRef.current = i; setDragging(i) }

  /**
   * On a short race two splits sit closer than their 48 px hit areas, and the
   * later handle is on top. Grab whichever split is nearest the pointer, not
   * whichever element took the press, so stop 1 stays movable from the overlap.
   */
  const onPointerDown = (index: number) => (e: PointerEvent<HTMLDivElement>) => {
    const at = lapAtExact(e.clientX)
    let pick = index
    if (at !== null) {
      let best = Infinity
      stops.forEach((s, i) => { const d = Math.abs(s.lap - at); if (d < best) { best = d; pick = i } })
    }
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* jsdom / no active pointer */ }
    setDrag(pick)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const index = draggingRef.current
    if (index === null) return
    // No button held: the release was missed (capture failed or was lost). Drop the drag.
    if (e.buttons === 0) { setDrag(null); return }
    const at = lapAtExact(e.clientX)
    if (at !== null) move(index, Math.round(at))
  }
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    try { e.currentTarget.releasePointerCapture?.(e.pointerId) } catch { /* not captured */ }
    setDrag(null)
  }

  return (
    <div ref={barRef} role="group" aria-label={label} style={{ position: 'relative', height: 48, display: 'flex', alignItems: 'center', gap: 4 }}>
      {stints.map((s, i) => (
        <div key={i} className="slant-row" aria-hidden="true"
          style={{ flex: Math.max(1, s.to - s.from + 1), minWidth: 0, height: 40, background: TYRE_COLOR[s.compound], color: 'var(--ink)',
            display: 'flex', alignItems: 'center', paddingLeft: 12, overflow: 'hidden',
            fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>
          {`${s.compound} · L${s.from}–${s.to}`}
        </div>
      ))}
      {stops.map((stop, i) => {
        const [lo, hi] = boundsFor(laps, stops, i)
        const active = dragging === i
        return (
          <div key={i} role="slider" tabIndex={0} className="kit-focus"
            aria-label={`Stop ${i + 1} lap`} aria-valuemin={lo} aria-valuemax={hi} aria-valuenow={stop.lap} aria-valuetext={`Lap ${stop.lap}`}
            aria-orientation="horizontal"
            onKeyDown={onKeyDown(i)} onPointerDown={onPointerDown(i)} onPointerMove={onPointerMove}
            onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
            style={{ position: 'absolute', top: 0, left: `calc(${(stop.lap / laps) * 100}% - 24px)`, width: 48, height: 48,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize', touchAction: 'none', zIndex: 1 }}>
            <span aria-hidden="true" style={{ width: active ? 10 : 6, height: 48, background: 'var(--white)',
              boxShadow: '0 0 0 2px var(--ink)', transform: 'skewX(-8deg)', transition: 'width 0.12s cubic-bezier(0.2, 0, 0, 1)' }} />
          </div>
        )
      })}
    </div>
  )
}
