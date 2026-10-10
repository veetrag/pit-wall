import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CircuitOutline, StandingRow } from '@ui/kit'
import { CIRCUIT_PATHS } from '@data/circuitPaths'
import { HelmetAvatar } from '@ui/HelmetAvatar'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('kit art 2', () => {
  it('has a path for every circuit in circuits.json', async () => {
    const data = (await import('@data/circuits.json')).default as { circuits: Record<string, unknown> }
    for (const id of Object.keys(data.circuits)) expect(CIRCUIT_PATHS[id], id).toBeTruthy()
  })
  it('CircuitOutline draws a closed outline in volt inside the requested box', () => {
    render(<CircuitOutline circuitId="silverpark" width={120} height={100} label="Silverpark layout" />)
    const svg = screen.getByRole('img', { name: 'Silverpark layout' })
    expect(svg.getAttribute('width')).toBe('120')
    const path = svg.querySelector('path')!
    expect(path.getAttribute('d')).toMatch(/^M.*Z$/)
    expect(path.getAttribute('stroke')).toBe('var(--volt)')
  })
  it('CircuitOutline renders nothing for an unknown circuit', () => {
    const { container } = render(<CircuitOutline circuitId="nowhere" width={10} height={10} label="x" />)
    expect(container.querySelector('svg')).toBeNull()
  })
  it('StandingRow: the player row is volt with ink text and is taller', () => {
    render(<div><StandingRow pos={1} teamColor="#00E5D0" name="Lars Voss" value={43} mine bar={1} />
      <StandingRow pos={2} teamColor="#E8344E" name="Enzo Rossi" value={43} bar={1} /></div>)
    const mine = screen.getByText('Lars Voss').closest('[data-standing-row]') as HTMLElement
    const other = screen.getByText('Enzo Rossi').closest('[data-standing-row]') as HTMLElement
    expect(mine.style.background).toContain('--volt'); expect(mine.style.color).toContain('--ink')
    expect(parseInt(mine.style.height, 10)).toBeGreaterThan(parseInt(other.style.height, 10))
  })
  it('the helmet is flat: no gradients or filters', () => {
    const { container } = render(<HelmetAvatar teamPrimary="#00E5D0" teamSecondary="#FFD60A" size={64} />)
    expect(container.querySelector('linearGradient, radialGradient, filter')).toBeNull()
  })
  it('the track renderer no longer owns the circuit paths', () => {
    const tc = readFileSync(join(__dirname, '../../src/canvas/TrackCanvas.tsx'), 'utf8')
    expect(tc).not.toMatch(/@data\/paths\/silverpark\.json/)
  })
})
