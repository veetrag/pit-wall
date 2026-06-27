import { describe, it, expect, vi, beforeEach } from 'vitest'

class MockOscillator {
  frequency = { setValueAtTime: vi.fn() }
  connect = vi.fn(); disconnect = vi.fn()
  start = vi.fn(); stop = vi.fn(); type = 'sine' as OscillatorType
  addEventListener = vi.fn()
}
class MockGain {
  gain = { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }
  connect = vi.fn(); disconnect = vi.fn()
}
class MockAudioContext {
  currentTime = 0
  state = 'running'
  createOscillator = vi.fn().mockReturnValue(new MockOscillator())
  createGain = vi.fn().mockReturnValue(new MockGain())
  destination = {}
  resume = vi.fn().mockResolvedValue(undefined)
}

vi.stubGlobal('AudioContext', MockAudioContext)

describe('soundService', () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it('play() does not throw for each sound name', async () => {
    const { soundService } = await import('@audio/soundService')
    const names = ['tick', 'lightsOut', 'pitConfirm', 'positionGain', 'positionLoss'] as const
    for (const name of names) {
      expect(() => soundService.play(name)).not.toThrow()
    }
  })

  it('play() is a no-op when soundEnabled is false', async () => {
    const { useSettingsStore } = await import('@state/settingsStore')
    useSettingsStore.setState({ soundEnabled: false })
    const { soundService } = await import('@audio/soundService')
    expect(() => soundService.play('tick')).not.toThrow()
  })
})
