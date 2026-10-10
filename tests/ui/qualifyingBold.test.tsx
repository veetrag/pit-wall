import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Qualifying } from '@ui/Qualifying'
import { useSeasonStore } from '@state/seasonStore'

describe('Qualifying in Race Day Bold', () => {
  beforeEach(() => {
    useSeasonStore.setState({ phase: 'qualifying', qualifyingResult: null, playerDriverId: 'd_voss' })
  })

  it('pairs tyre and attack, then shows a volt lap card and the grid with your row', async () => {
    render(<Qualifying />)
    expect(screen.getByRole('heading', { level: 1, name: /one flying lap/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /attack/i }).textContent).toMatch(/15\s*%/)
    fireEvent.click(screen.getByRole('button', { name: /^run lap$/i }))
    const status = await screen.findByTestId('qualifying-status')
    const rows = screen.getAllByTestId('qualifying-row')
    expect(rows.some(r => (r.closest('[data-standing-row]') as HTMLElement | null)?.style.background.includes('--volt'))).toBe(true)
    expect(status.textContent).toMatch(/P\d+/)
  })
})
