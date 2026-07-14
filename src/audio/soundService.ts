import { useSettingsStore } from '@state/settingsStore'

export type SoundName = 'tick' | 'lightsOut' | 'pitConfirm' | 'positionGain' | 'positionLoss' | 'finish' | 'navTap'

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
  finish() {
    beep(523, 0.14, 'sine', 0.22, true)
    setTimeout(() => beep(659, 0.14, 'sine', 0.22, true), 110)
    setTimeout(() => beep(784, 0.3, 'sine', 0.22, true), 220)
  },
  navTap() {
    beep(740, 0.05, 'sine', 0.12, true)
  },
}

// ─── Ambience ────────────────────────────────────────────────────────────────
// Procedurally synthesized (no external audio assets available in this
// environment) — an engine drone, a crowd murmur, and a rain layer whose
// volume tracks the live weather state. All built from oscillators/filtered
// noise so there's zero asset dependency.

interface AmbientLayer {
  gain: GainNode
  stop: () => void
}

function createNoiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

function fadeAndTeardown(c: AudioContext, gain: GainNode, nodes: AudioNode[]) {
  const now = c.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.linearRampToValueAtTime(0, now + 0.4)
  setTimeout(() => {
    for (const n of nodes) {
      try {
        // AudioScheduledSourceNode has stop(); plain nodes (gain/filter) don't.
        if ('stop' in n) (n as unknown as { stop: () => void }).stop()
      } catch { /* already stopped */ }
      n.disconnect()
    }
  }, 450)
}

function startEngineLayer(c: AudioContext): AmbientLayer {
  const gain = c.createGain()
  gain.gain.setValueAtTime(0, c.currentTime)
  gain.gain.linearRampToValueAtTime(0.05, c.currentTime + 1.5)

  const osc1 = c.createOscillator()
  osc1.type = 'sawtooth'
  osc1.frequency.setValueAtTime(60, c.currentTime)
  const osc2 = c.createOscillator()
  osc2.type = 'sawtooth'
  osc2.frequency.setValueAtTime(90.5, c.currentTime)

  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(220, c.currentTime)

  // Gentle wobble so the drone reads as a running engine, not a dead static tone
  const lfo = c.createOscillator()
  lfo.frequency.setValueAtTime(0.15, c.currentTime)
  const lfoGain = c.createGain()
  lfoGain.gain.setValueAtTime(8, c.currentTime)
  lfo.connect(lfoGain)
  lfoGain.connect(osc1.frequency)

  osc1.connect(filter)
  osc2.connect(filter)
  filter.connect(gain)
  gain.connect(c.destination)
  osc1.start()
  osc2.start()
  lfo.start()

  return { gain, stop: () => fadeAndTeardown(c, gain, [osc1, osc2, lfo, lfoGain, filter, gain]) }
}

function startCrowdLayer(c: AudioContext): AmbientLayer {
  const gain = c.createGain()
  gain.gain.setValueAtTime(0, c.currentTime)
  gain.gain.linearRampToValueAtTime(0.035, c.currentTime + 2)

  const src = c.createBufferSource()
  src.buffer = createNoiseBuffer(c, 3)
  src.loop = true

  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(500, c.currentTime)
  filter.Q.setValueAtTime(0.6, c.currentTime)

  src.connect(filter)
  filter.connect(gain)
  gain.connect(c.destination)
  src.start()

  return { gain, stop: () => fadeAndTeardown(c, gain, [src, filter, gain]) }
}

function startRainLayer(c: AudioContext): AmbientLayer {
  const gain = c.createGain()
  gain.gain.setValueAtTime(0, c.currentTime) // silent until setWeather ramps it in

  const src = c.createBufferSource()
  src.buffer = createNoiseBuffer(c, 3)
  src.loop = true

  const filter = c.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.setValueAtTime(2500, c.currentTime)

  src.connect(filter)
  filter.connect(gain)
  gain.connect(c.destination)
  src.start()

  return { gain, stop: () => fadeAndTeardown(c, gain, [src, filter, gain]) }
}

let engineLayer: AmbientLayer | null = null
let crowdLayer: AmbientLayer | null = null
let rainLayer: AmbientLayer | null = null
let ambienceActive = false

const RAIN_TARGET_GAIN: Record<string, number> = { DRY: 0, DAMP: 0.03, WET: 0.07 }

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

  // Starts the engine/crowd/rain ambience loop. Idempotent — safe to call every
  // render of an effect. No-ops if sound is disabled in settings.
  startAmbience() {
    if (ambienceActive) return
    if (!useSettingsStore.getState().soundEnabled) return
    const c = getCtx()
    if (!c) return
    try {
      ambienceActive = true
      engineLayer = startEngineLayer(c)
      crowdLayer = startCrowdLayer(c)
      rainLayer = startRainLayer(c)
    } catch {
      ambienceActive = false
    }
  },

  stopAmbience() {
    if (!ambienceActive) return
    ambienceActive = false
    engineLayer?.stop(); engineLayer = null
    crowdLayer?.stop(); crowdLayer = null
    rainLayer?.stop(); rainLayer = null
  },

  // Ramps the rain layer's volume to match the live weather state.
  setWeather(weatherState: string) {
    if (!rainLayer) return
    const c = getCtx()
    if (!c) return
    const target = RAIN_TARGET_GAIN[weatherState] ?? 0
    rainLayer.gain.gain.cancelScheduledValues(c.currentTime)
    rainLayer.gain.gain.linearRampToValueAtTime(target, c.currentTime + 1.2)
  },
}
