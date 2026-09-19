import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CareerRecord } from '@ui/CareerRecord'
import { useCareerStore } from '@state/careerStore'

describe('Career record', () => {
  beforeEach(() => {
    useCareerStore.getState().beginCareer()
    useCareerStore.setState({
      seasonNumber: 4, titles: 2, wins: 21, podiums: 40, poles: 9,
      racesStarted: 36, bestFinish: 1,
      seasonHistory: [
        { seasonNumber: 1, teamId: 'apex', driverId: 'd_voss', championshipPosition: 3, points: 180, wins: 4 },
        { seasonNumber: 2, teamId: 'apex', driverId: 'd_voss', championshipPosition: 1, points: 310, wins: 9 },
        { seasonNumber: 3, teamId: 'apex', driverId: 'd_voss', championshipPosition: 1, points: 290, wins: 8 },
      ],
    })
  })

  it('SHOWS THE HEADLINE TOTALS', () => {
    render(<CareerRecord />)
    for (const n of ['2', '21', '9']) {
      expect(screen.getAllByText(new RegExp(`\\b${n}\\b`)).length).toBeGreaterThan(0)
    }
  })

  it('SHOWS ONE ROW PER COMPLETED SEASON', () => {
    /*
     * The career is endless by design, so the record IS the payoff -- there is
     * no ending to reach. A history that silently truncated would remove the
     * only thing that makes a long career legible.
     */
    render(<CareerRecord />)
    expect(screen.getAllByTestId('career-season-row')).toHaveLength(3)
  })

  it('POLES ARE SHOWN, BECAUSE QUALIFYING MADE THEM MEAN SOMETHING', () => {
    render(<CareerRecord />)
    expect(screen.getByText(/poles/i)).toBeTruthy()
  })
})
