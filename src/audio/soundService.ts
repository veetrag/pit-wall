import { useSettingsStore } from '@state/settingsStore'
import { makeAmbienceMix, type AmbienceMix } from './ambienceMix'

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
// Procedurally synthesized at runtime (zero audio assets): an engine drone,
// a crowd bed, a rain layer and a red-flag pit-lane murmur, all summed into
// one master gain. What each layer does is decided by the pure
// ambienceMix.ts; this file only turns a mix into smooth parameter moves.

/** Time constant (s) for every ambience move: ~95% there in 3*TAU. */
export const AMBIENCE_TAU = 0.5
const EPS = 1e-4

interface AmbienceGraph {
  master: GainNode
  engine: GainNode
  engineOscs: OscillatorNode[]
  engineFilter: BiquadFilterNode
  crowd: GainNode
  rain: GainNode
  murmur: GainNode
  sources: AudioScheduledSourceNode[]
  nodes: AudioNode[]
  last: AmbienceMix
}

const ENGINE_BASE_HZ = [60, 90.5] as const

let noiseBuffer: AudioBuffer | null = null
function getNoise(c: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === c.sampleRate) return noiseBuffer
  const len = Math.floor(c.sampleRate * 3)
  const buffer = c.createBuffer(1, len, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  // Crossfade the tail into the head so the loop point has no click.
  const fade = Math.floor(c.sampleRate * 0.05)
  for (let i = 0; i < fade; i++) {
    const t = i / fade
    const head = data[i] ?? 0
    const tail = data[len - fade + i] ?? 0
    data[len - fade + i] = tail * (1 - t) + head * t
  }
  noiseBuffer = buffer
  return buffer
}

function buildGraph(c: AudioContext): AmbienceGraph {
  const now = c.currentTime
  const nodes: AudioNode[] = []
  const sources: AudioScheduledSourceNode[] = []
  const gain = (v: number) => { const g = c.createGain(); g.gain.setValueAtTime(v, now); nodes.push(g); return g }
  const filter = (type: BiquadFilterType, hz: number, q = 1) => {
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(hz, now); f.Q.setValueAtTime(q, now); nodes.push(f); return f
  }
  const noise = () => {
    const s = c.createBufferSource(); s.buffer = getNoise(c); s.loop = true
    // Random offsets so the three noise layers aren't phase-locked copies.
    s.start(now, Math.random() * 2.5); sources.push(s); nodes.push(s); return s
  }
  const osc = (type: OscillatorType, hz: number) => {
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(hz, now)
    o.start(now); sources.push(o); nodes.push(o); return o
  }

  const master = gain(0)
  master.connect(c.destination)

  // Engine: two detuned saws through a lowpass, a slow wobble on one.
  const engine = gain(0)
  const engineFilter = filter('lowpass', 240)
  engineFilter.connect(engine); engine.connect(master)
  const engineOscs = ENGINE_BASE_HZ.map(hz => { const o = osc('sawtooth', hz); o.connect(engineFilter); return o })
  const lfoDepth = gain(8)
  osc('sine', 0.15).connect(lfoDepth)
  const firstOsc = engineOscs[0]
  if (firstOsc) lfoDepth.connect(firstOsc.frequency)

  // Crowd: bandpassed noise.
  const crowd = gain(0)
  const crowdF = filter('bandpass', 500, 0.6)
  noise().connect(crowdF); crowdF.connect(crowd); crowd.connect(master)

  // Rain: highpassed noise.
  const rain = gain(0)
  const rainF = filter('highpass', 2500)
  noise().connect(rainF); rainF.connect(rain); rain.connect(master)

  // Murmur: low, slowly breathing noise (voices + idle pit lane).
  const murmur = gain(0)
  const murmurF = filter('lowpass', 420, 0.7)
  const murmurAm = gain(1)
  const amDepth = gain(0.35)
  osc('sine', 0.3).connect(amDepth); amDepth.connect(murmurAm.gain)
  noise().connect(murmurF); murmurF.connect(murmurAm); murmurAm.connect(murmur); murmur.connect(master)

  return { master, engine, engineOscs, engineFilter, crowd, rain, murmur, sources, nodes, last: makeAmbienceMix() }
}

function glide(p: AudioParam, from: number, to: number, now: number, tau = AMBIENCE_TAU) {
  if (Math.abs(from - to) < EPS) return
  p.setTargetAtTime(to, now, tau)
}

function applyToGraph(c: AudioContext, g: AmbienceGraph, m: AmbienceMix) {
  const now = c.currentTime
  const l = g.last
  glide(g.master.gain, l.master, m.master, now)
  glide(g.engine.gain, l.engineGain, m.engineGain, now)
  glide(g.engineFilter.frequency, l.engineCutoff, m.engineCutoff, now)
  if (Math.abs(l.enginePitch - m.enginePitch) >= EPS) {
    // Pitch moves slower than level: an engine winds down, it doesn't step.
    for (let i = 0; i < g.engineOscs.length; i++) {
      g.engineOscs[i]?.frequency.setTargetAtTime((ENGINE_BASE_HZ[i] ?? 60) * m.enginePitch, now, AMBIENCE_TAU * 2)
    }
  }
  glide(g.crowd.gain, l.crowdGain, m.crowdGain, now)
  glide(g.rain.gain, l.rainGain, m.rainGain, now)
  glide(g.murmur.gain, l.murmurGain, m.murmurGain, now)
  Object.assign(l, m)
}

let graph: AmbienceGraph | null = null
const pendingMix: AmbienceMix = makeAmbienceMix()

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

  /** Builds the ambience graph, fading in to the latest mix. Idempotent. */
  startAmbience() {
    if (graph) return
    if (!useSettingsStore.getState().soundEnabled) return
    const c = getCtx()
    if (!c) return
    try {
      graph = buildGraph(c)
      applyToGraph(c, graph, pendingMix)
    } catch {
      graph = null
    }
  },

  /** Fades the whole bed out on the master, then frees every node. */
  stopAmbience() {
    const g = graph
    if (!g) return
    graph = null
    const c = getCtx()
    if (!c) return
    const now = c.currentTime
    g.master.gain.cancelScheduledValues(now)
    g.master.gain.setValueAtTime(g.last.master, now)
    g.master.gain.setTargetAtTime(0, now, 0.12)
    setTimeout(() => {
      for (const s of g.sources) { try { s.stop() } catch { /* already stopped */ } }
      for (const n of g.nodes) n.disconnect()
    }, 800)
  },

  /** Push a new target mix (copied); the graph glides to it. Cheap if nothing moved. */
  setAmbienceMix(mix: AmbienceMix) {
    Object.assign(pendingMix, mix)
    if (!graph) return
    const c = getCtx()
    if (!c) return
    applyToGraph(c, graph, pendingMix)
  },

  /** Whether an ambience graph is live. */
  isAmbienceActive(): boolean { return graph !== null },
}

/** Test hook: forget the cached context/graph/buffer between tests. */
export function __resetAudioForTests() {
  ctx = null; graph = null; noiseBuffer = null
  Object.assign(pendingMix, makeAmbienceMix())
}
