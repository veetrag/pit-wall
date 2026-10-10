import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StintBar, stopBounds } from '@ui/StintBar'

describe('stopBounds (unchanged rules, now named)', () => {
  it('one stop: lap 5 to laps-3', () => expect(stopBounds(49, 1, 20)).toMatchObject({ min1: 5, max1: 46 }))
  it('two stops: stop 1 leaves room, stop 2 follows by the stint gap', () =>
    expect(stopBounds(49, 2, 20)).toEqual({ min1: 5, max1: 42, min2: 24, max2: 47 }))
  it('shortest sensible race still yields min <= max', () => {
    const b = stopBounds(20, 2, 9)
    expect(b.min1).toBeLessThanOrEqual(b.max1); expect(b.min2).toBeLessThanOrEqual(b.max2)
  })
})

describe('StintBar', () => {
  it('renders one segment per stint and one slider per stop', () => {
    render(<StintBar laps={49} startCompound="M" stops={[{ lap: 23, compound: 'H' }]} onChange={() => {}} />)
    expect(screen.getByText('M · L1–23')).toBeTruthy()
    expect(screen.getByText('H · L24–49')).toBeTruthy()
    const s = screen.getByRole('slider', { name: 'Stop 1 lap' })
    expect(s.getAttribute('aria-valuenow')).toBe('23')
    expect(s.getAttribute('aria-valuemax')).toBe('46')
  })
  it('arrows move the stop within bounds; End goes to the max', () => {
    const calls: [number, number][] = []
    render(<StintBar laps={49} startCompound="M" stops={[{ lap: 46, compound: 'H' }]} onChange={(i, l) => calls.push([i, l])} />)
    const s = screen.getByRole('slider', { name: 'Stop 1 lap' })
    fireEvent.keyDown(s, { key: 'ArrowRight' })
    expect(calls).toEqual([])           // already at max 46: no change
    fireEvent.keyDown(s, { key: 'ArrowLeft' })
    fireEvent.keyDown(s, { key: 'Home' })
    expect(calls).toEqual([[0, 45], [0, 5]])
  })
  it('stop 2 cannot be dragged closer than the stint gap to stop 1', () => {
    const calls: [number, number][] = []
    render(<StintBar laps={49} startCompound="M" stops={[{ lap: 20, compound: 'H' }, { lap: 24, compound: 'M' }]} onChange={(i, l) => calls.push([i, l])} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Stop 2 lap' }), { key: 'ArrowLeft' })
    expect(calls).toEqual([])
  })
})
