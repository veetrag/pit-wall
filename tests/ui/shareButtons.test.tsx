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

describe('ShareButton in flight', () => {
  it('is disabled while sharing and a second fast tap never shares twice', async () => {
    sharePng.mockClear()
    let release!: () => void
    sharePng.mockImplementationOnce(() => new Promise(r => { release = () => r('failed') }))
    render(<ShareButton fileName="a.png" build={() => ({ kind: 'gp', position: 1, label: 'X', points: 25, podium: [], teamColor: '#00E5D0' })} />)
    const b = screen.getByRole('button', { name: /share result card/i })
    fireEvent.click(b)
    fireEvent.click(b)
    await waitFor(() => expect(sharePng).toHaveBeenCalledTimes(1))
    expect((b as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(b)
    release()
    await waitFor(() => expect((b as HTMLButtonElement).disabled).toBe(false))
    expect(sharePng).toHaveBeenCalledTimes(1)
  })
})
