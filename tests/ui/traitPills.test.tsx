import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TraitPills, circuitTraitIds, HIGH_WEAR_THRESHOLD } from '@ui/kit'

describe('trait pills', () => {
  it('derives traits from data', () => {
    expect(circuitTraitIds('lantern_quay')).toEqual(['night', 'street', 'sc_risk'])
    expect(circuitTraitIds('mesa_roja')).toEqual(['high_wear'])
    expect(circuitTraitIds('harbour_lights')).toEqual(['night', 'street'])
    expect(circuitTraitIds('veloce')).toEqual([])
  })
  it('exports the single high-wear threshold', () => {
    expect(HIGH_WEAR_THRESHOLD).toBe(1.15)
  })
  it('renders text with a spelled-out label, never colour alone', () => {
    render(<TraitPills circuitId="lantern_quay" />)
    expect(screen.getByLabelText('Night race').textContent).toBe('NIGHT RACE')
    expect(screen.getByLabelText('Street circuit').textContent).toBe('STREET')
    expect(screen.getByLabelText('High safety car risk').textContent).toBe('SAFETY CAR RISK')
  })
  it('renders nothing for a circuit with no trait', () => {
    const { container } = render(<TraitPills circuitId="veloce" />)
    expect(container.innerHTML).toBe('')
  })
})
