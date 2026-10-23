import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { soundService, __resetAudioForTests } from '@audio/soundService'
import { useSettingsStore } from '@state/settingsStore'
import { computeAmbienceMix, makeAmbienceInput, makeAmbienceMix } from '@audio/ambienceMix'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

/* A minimal Web Audio fake that records every parameter move. */
class FakeParam {
  value = 0
  calls: { kind: string; v: number }[] = []
  setValueAtTime(v: number) { this.calls.push({ kind: 'set', v }); this.value = v }
  setTargetAtTime(v: number) { this.calls.push({ kind: 'target', v }) }
  linearRampToValueAtTime(v: number) { this.calls.push({ kind: 'ramp', v }) }
  cancelScheduledValues() { this.calls.push({ kind: 'cancel', v: 0 }) }
}
class FakeNode {
  disconnected = false; stopped = false
  gain = new FakeParam(); frequency = new FakeParam(); Q = new FakeParam()
  type = ''; buffer: unknown = null; loop = false
  connect() {} disconnect() { this.disconnected = true }
  start() {} stop() { this.stopped = true }
  addEventListener() {}
}
const created: FakeNode[] = []
const mk = () => { const n = new FakeNode(); created.push(n); return n }
class FakeCtx {
  currentTime = 0; sampleRate = 8000; state = 'running'; destination = {}
  createGain = mk; createOscillator = mk; createBiquadFilter = mk; createBufferSource = mk
  createBuffer(_c: number, len: number, sampleRate: number) { const d = new Float32Array(len); return { sampleRate, getChannelData: () => d } }
  resume() { return Promise.resolve() }
}

const racingMix = () => computeAmbienceMix({ ...makeAmbienceInput(), phase: 'racing' }, makeAmbienceMix())
const targets = () => created.flatMap(n => [...n.gain.calls, ...n.frequency.calls]).filter(c => c.kind === 'target').length

describe('soundService ambience manager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    created.length = 0
    __resetAudioForTests()
    vi.stubGlobal('AudioContext', FakeCtx)
    useSettingsStore.setState({ soundEnabled: true })
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('does not build anything when sound is muted', () => {
    useSettingsStore.setState({ soundEnabled: false })
    soundService.startAmbience()
    expect(soundService.isAmbienceActive()).toBe(false)
    expect(created).toHaveLength(0)
  })

  it('start is idempotent', () => {
    soundService.startAmbience()
    const n = created.length
    soundService.startAmbience()
    expect(created.length).toBe(n)
  })

  it('fades in to the mix pushed before start, via smooth targets (no hard sets)', () => {
    soundService.setAmbienceMix(racingMix())
    soundService.startAmbience()
    const master = created[0]
    expect(master?.gain.calls[0]).toEqual({ kind: 'set', v: 0 })
    expect(master?.gain.calls.slice(-1)[0]).toEqual({ kind: 'target', v: 1 })
  })

  it('an unchanged mix schedules nothing (cheap per tick)', () => {
    soundService.startAmbience()
    soundService.setAmbienceMix(racingMix())
    const before = targets()
    soundService.setAmbienceMix(racingMix())
    expect(targets()).toBe(before)
  })

  it('a changed mix glides only the moved params', () => {
    soundService.startAmbience()
    soundService.setAmbienceMix(racingMix())
    const before = targets()
    const m = racingMix(); m.rainGain = 0.05
    soundService.setAmbienceMix(m)
    expect(targets()).toBe(before + 1)
  })

  it('stop fades the master and frees every node after the fade', () => {
    soundService.startAmbience()
    soundService.setAmbienceMix(racingMix())
    soundService.stopAmbience()
    expect(soundService.isAmbienceActive()).toBe(false)
    expect(created[0]?.gain.calls.slice(-1)[0]).toEqual({ kind: 'target', v: 0 })
    expect(created.some(n => n.disconnected)).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(created.every(n => n.disconnected)).toBe(true)
  })

  it('no-ops without Web Audio', () => {
    vi.stubGlobal('AudioContext', undefined)
    __resetAudioForTests()
    expect(() => { soundService.startAmbience(); soundService.setAmbienceMix(racingMix()); soundService.stopAmbience() }).not.toThrow()
  })
})
