import { useSettingsStore } from '@state/settingsStore'

export type SoundName = 'tick' | 'lightsOut' | 'pitConfirm' | 'positionGain' | 'positionLoss'

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function beep(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.25,
  fadeOut = true,
) {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, c.currentTime)
  g.gain.setValueAtTime(gain, c.currentTime)
  if (fadeOut) g.gain.linearRampToValueAtTime(0, c.currentTime + duration)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(c.currentTime)
  osc.stop(c.currentTime + duration)
  osc.addEventListener('ended', () => { osc.disconnect(); g.disconnect() })
}

const SOUNDS: Record<SoundName, () => void> = {
  tick() {
    beep(880, 0.08, 'sine', 0.2, true)
  },
  lightsOut() {
    beep(220, 0.6, 'sawtooth', 0.3, true)
    setTimeout(() => beep(440, 0.3, 'sine', 0.25, true), 150)
  },
  pitConfirm() {
    beep(600, 0.12, 'square', 0.2, true)
    setTimeout(() => beep(900, 0.1, 'square', 0.15, true), 120)
  },
  positionGain() {
    beep(660, 0.1, 'sine', 0.15, true)
    setTimeout(() => beep(880, 0.15, 'sine', 0.15, true), 80)
  },
  positionLoss() {
    beep(440, 0.15, 'sine', 0.15, true)
    setTimeout(() => beep(330, 0.2, 'sine', 0.15, true), 80)
  },
}

export const soundService = {
  play(name: SoundName) {
    const { soundEnabled } = useSettingsStore.getState()
    if (!soundEnabled) return
    try {
      SOUNDS[name]()
    } catch {
      // Web Audio may fail silently on some browsers
    }
  },
}
