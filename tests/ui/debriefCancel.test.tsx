import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RaceResult } from '@ui/RaceResult'
import { useDebriefStore } from '@state/debriefStore'

describe('RaceResult debrief lifecycle', () => {
  it('does not cancel on mount, but MENU cancels', () => {
    useDebriefStore.setState({ status: 'running', done: 1, total: 10, result: null, raceKey: 'r' })
    render(<RaceResult />)
    expect(useDebriefStore.getState().status).toBe('running')
    fireEvent.click(screen.getByText('MENU'))
    expect(useDebriefStore.getState().status).toBe('idle')
  })

  it('RETRY cancels the running debrief', () => {
    useDebriefStore.setState({ status: 'running', done: 1, total: 10, result: null, raceKey: 'r' })
    render(<RaceResult />)
    fireEvent.click(screen.getByText(/RETRY ROUND/))
    expect(useDebriefStore.getState().status).toBe('idle')
  })
})
