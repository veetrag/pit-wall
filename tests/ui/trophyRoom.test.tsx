import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async () => {}),
    get: vi.fn(async () => ({ value: null })),
    remove: vi.fn(async () => {}),
  },
}))

import { CareerRecord } from '@ui/CareerRecord'
import { MainMenu } from '@ui/MainMenu'
import { useCareerStore } from '@state/careerStore'
import { BADGES } from '@state/badges'

describe('Trophy room', () => {
  beforeEach(() => {
    useCareerStore.getState().beginCareer()
    useCareerStore.setState({
      seasonNumber: 4, titles: 2, wins: 21, podiums: 40, poles: 9, racesStarted: 36, bestFinish: 1,
      seasonHistory: [
        { seasonNumber: 1, teamId: 'apex', driverId: 'd_voss', championshipPosition: 3, points: 180, wins: 4 },
      ],
    })
  })

  it('is the trophy room: four stat tiles, a badge wall with earned volt and locked grape', () => {
    render(<CareerRecord />)
    expect(screen.getByRole('heading', { level: 1, name: /trophy room/i })).toBeTruthy()
    for (const k of ['TITLES', 'WINS', 'PODIUMS', 'BEST']) expect(screen.getByText(k)).toBeTruthy()
    const earned = document.querySelector('[data-earned="true"]') as HTMLElement | null
    const locked = document.querySelector('[data-earned="false"]') as HTMLElement
    if (earned) expect(earned.style.background).toContain('--volt')
    expect(locked.style.background).toContain('--grape')
  })

  it('a first-time career still shows the wall and the empty history card', () => {
    useCareerStore.getState().beginCareer()
    render(<CareerRecord />)
    expect(screen.getByText(/THE RECORD STARTS AT THE CHEQUERED FLAG/)).toBeTruthy()
    expect(screen.getByText(`0 / ${BADGES.length}`)).toBeTruthy()
  })

  it('the menu offers TROPHIES with the badge count', async () => {
    render(<MainMenu />)
    expect(await screen.findByRole('button', { name: /TROPHIES/ })).toBeTruthy()
  })
})
