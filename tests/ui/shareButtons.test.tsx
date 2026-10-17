import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))
const sharePng = vi.hoisted(() => vi.fn(async () => 'failed' as const))
vi.mock('@ui/share/sharePng', () => ({ sharePng }))
vi.mock('@ui/share/shareCard', async (orig) => ({
  ...(await orig<typeof import('@ui/share/shareCard')>()),
  renderShareCard: vi.fn(async () => new Blob(['x'], { type: 'image/png' })),
}))

import { ShareButton } from '@ui/share/ShareButton'

describe('ShareButton', () => {
  it('is labelled, at least 44px, and reports a failure politely', async () => {
    render(<ShareButton fileName="pitwall-p3.png" build={() => ({ kind: 'gp', position: 3, label: 'X', points: 15, podium: [], teamColor: '#00E5D0' })} />)
    const b = screen.getByRole('button', { name: /share result card/i })
    expect(parseInt(b.style.minHeight, 10)).toBeGreaterThanOrEqual(44)
    fireEvent.click(b)
    await waitFor(() => expect(sharePng).toHaveBeenCalledWith(expect.any(Blob), 'pitwall-p3.png', expect.any(String)))
    expect(await screen.findByText(/couldn.t share/i)).toBeTruthy()
  })
})
