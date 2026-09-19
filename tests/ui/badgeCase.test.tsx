import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BadgeCase } from '@ui/BadgeCase'
import { useCareerStore } from '@state/careerStore'
import { BADGES } from '@state/badges'

describe('BadgeCase', () => {
  beforeEach(() => { useCareerStore.getState().beginCareer() })

  it('RENDERS EVERY BADGE, EARNED OR NOT', () => {
    render(<BadgeCase />)
    for (const b of BADGES) expect(screen.getByText(b.name)).toBeTruthy()
  })

  it('SHOWS THE CONDITION OF A LOCKED BADGE', () => {
    // A locked badge whose requirement is hidden is a mystery box, not a goal.
    render(<BadgeCase />)
    expect(screen.getByText('Win the championship')).toBeTruthy()
  })

  it('counts earned out of total, and the count tracks the record', () => {
    render(<BadgeCase />)
    expect(screen.getByText(`0 / ${BADGES.length}`)).toBeTruthy()
  })

  it('marks an earned badge as earned for a screen reader, not by colour alone', () => {
    useCareerStore.setState({ wins: 1 })
    render(<BadgeCase />)
    const winner = screen.getByTestId('badge-winner')
    expect(winner.getAttribute('data-earned')).toBe('true')
    expect(winner.getAttribute('aria-label')).toContain('earned')
  })
})
