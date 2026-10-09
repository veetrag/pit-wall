import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CarArt, liveryOf, TyreMeter } from '@ui/kit'
import { useSettingsStore } from '@state/settingsStore'
beforeEach(() => useSettingsStore.setState({ reducedMotion: true }))
describe('art kit', () => {
  it('CarArt is a labelled image in the given livery', () => {
    const { container } = render(<CarArt primary="#00E5D0" accent="#FFD60A" height={120} label="Apex Racing car" />)
    expect(screen.getByRole('img', { name: 'Apex Racing car' })).toBeTruthy()
    const fills = Array.from(container.querySelectorAll('[fill]')).map(e => e.getAttribute('fill'))
    expect(fills).toContain('#00E5D0'); expect(fills).toContain('#FFD60A')
  })
  it('liveryOf reads the team data', () => {
    expect(liveryOf('apex').primary).toBe('#00E5D0')
    expect(liveryOf('nope').primary).toBe('var(--volt)')
    // Cached at module level: the second lookup reuses the first, not a re-parse.
    expect(liveryOf('apex')).toBe(liveryOf('apex'))
  })
  it('TyreMeter exposes wear and lights segments in proportion', () => {
    const { container } = render(<TyreMeter compound="M" wear={0.65} lapsOnTyre={13} cliffLaps={8} />)
    const m = screen.getByRole('meter', { name: /tyre wear/i })
    expect(m.getAttribute('aria-valuenow')).toBe('65')
    expect(container.querySelectorAll('[data-lit="true"]').length).toBe(7)
    expect(screen.getByText(/CLIFF ~8L/)).toBeTruthy()
  })
  it('TyreMeter pluralises laps', () => {
    const { rerender } = render(<TyreMeter compound="M" wear={0.1} lapsOnTyre={1} cliffLaps={8} />)
    expect(screen.getByText(/· 1 lap$/)).toBeTruthy()
    rerender(<TyreMeter compound="M" wear={0.1} lapsOnTyre={2} cliffLaps={8} />)
    expect(screen.getByText(/· 2 laps$/)).toBeTruthy()
  })
  it('TyreMeter says when the tyre is past the cliff', () => {
    render(<TyreMeter compound="S" wear={1} lapsOnTyre={20} cliffLaps={null} pastCliff />)
    expect(screen.getByText(/PAST CLIFF/)).toBeTruthy()
  })
})
