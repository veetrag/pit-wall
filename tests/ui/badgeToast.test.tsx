import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BadgeToast } from '@ui/BadgeToast'
import { useCareerStore } from '@state/careerStore'
import { useSettingsStore } from '@state/settingsStore'

describe('BadgeToast', () => {
  beforeEach(() => {
    useCareerStore.getState().beginCareer()
    useSettingsStore.setState({ reducedMotion: false })
  })

  it('RENDERS NOTHING WHEN NOTHING WAS EARNED', () => {
    const { container } = render(<BadgeToast />)
    expect(container.textContent).toBe('')
  })

  it('ANNOUNCES A BADGE EARNED BY THIS RACE', () => {
    useCareerStore.setState({ justEarned: ['winner'] })
    render(<BadgeToast />)
    expect(screen.getByText('Winner')).toBeTruthy()
    expect(screen.getByText(/badge earned/i)).toBeTruthy()
  })

  it('still renders its text with reduced motion on', () => {
    // Reduced motion removes MOVEMENT, never information.
    useSettingsStore.setState({ reducedMotion: true })
    useCareerStore.setState({ justEarned: ['champion'] })
    render(<BadgeToast />)
    expect(screen.getByText('Champion')).toBeTruthy()
  })

  it('ignores an unknown id rather than crashing', () => {
    // justEarned is data; a stale or renamed id must not take down the
    // post-race screen, which is a screen with no way out.
    useCareerStore.setState({ justEarned: ['no_such_badge'] })
    const { container } = render(<BadgeToast />)
    expect(container.textContent).toBe('')
  })
})
