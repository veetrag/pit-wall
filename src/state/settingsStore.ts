import { create } from 'zustand'
import { Preferences } from '@capacitor/preferences'

export type SimSpeed = 1 | 2 | 4
export type Difficulty = 'rookie' | 'pro'

export interface SettingsState {
  soundEnabled: boolean
  hapticsEnabled: boolean
  reducedMotion: boolean
  simSpeed: SimSpeed
  proMode: boolean
  skipStartSequence: boolean
  difficulty: Difficulty
  setSoundEnabled: (v: boolean) => void
  setHapticsEnabled: (v: boolean) => void
  setReducedMotion: (v: boolean) => void
  setSimSpeed: (v: SimSpeed) => void
  setProMode: (v: boolean) => void
  setSkipStartSequence: (v: boolean) => void
  setDifficulty: (v: Difficulty) => void
  loadSettings: () => Promise<void>
}

const K = {
  sound: 'settings.sound',
  haptics: 'settings.haptics',
  motion: 'settings.motion',
  simSpeed: 'settings.simSpeed',
  proMode: 'settings.proMode',
  skipStart: 'settings.skipStart',
  difficulty: 'settings.difficulty',
}

export const useSettingsStore = create<SettingsState>((set) => ({
  soundEnabled: true,
  hapticsEnabled: true,
  reducedMotion: false,
  simSpeed: 1,
  proMode: false,
  skipStartSequence: false,
  difficulty: 'rookie',

  setSoundEnabled(v) { set({ soundEnabled: v }); void Preferences.set({ key: K.sound, value: String(v) }) },
  setHapticsEnabled(v) { set({ hapticsEnabled: v }); void Preferences.set({ key: K.haptics, value: String(v) }) },
  setReducedMotion(v) { set({ reducedMotion: v }); void Preferences.set({ key: K.motion, value: String(v) }) },
  setSimSpeed(v) { set({ simSpeed: v }); void Preferences.set({ key: K.simSpeed, value: String(v) }) },
  setProMode(v) { set({ proMode: v }); void Preferences.set({ key: K.proMode, value: String(v) }) },
  setSkipStartSequence(v) { set({ skipStartSequence: v }); void Preferences.set({ key: K.skipStart, value: String(v) }) },
  setDifficulty(v) { set({ difficulty: v }); void Preferences.set({ key: K.difficulty, value: v }) },

  async loadSettings() {
    const keys = Object.values(K)
    const results = await Promise.all(keys.map(k => Preferences.get({ key: k })))
    const [sound, haptics, motion, simSpeed, proMode, skipStart, difficulty] = results.map(r => r.value)
    set({
      soundEnabled:      sound     != null ? sound     === 'true' : true,
      hapticsEnabled:    haptics   != null ? haptics   === 'true' : true,
      reducedMotion:     motion    != null ? motion    === 'true' : false,
      simSpeed:          simSpeed  != null ? (Number(simSpeed) as SimSpeed) : 1,
      proMode:           proMode   != null ? proMode   === 'true' : false,
      skipStartSequence: skipStart != null ? skipStart === 'true' : false,
      difficulty:        difficulty === 'pro' ? 'pro' : 'rookie',
    })
  },
}))
