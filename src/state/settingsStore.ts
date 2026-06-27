import { create } from 'zustand'
import { Preferences } from '@capacitor/preferences'

export interface SettingsState {
  soundEnabled: boolean
  hapticsEnabled: boolean
  reducedMotion: boolean
  setSoundEnabled: (v: boolean) => void
  setHapticsEnabled: (v: boolean) => void
  setReducedMotion: (v: boolean) => void
  loadSettings: () => Promise<void>
}

const KEYS = { sound: 'settings.sound', haptics: 'settings.haptics', motion: 'settings.motion' }

export const useSettingsStore = create<SettingsState>((set, get) => ({
  soundEnabled: true,
  hapticsEnabled: true,
  reducedMotion: false,

  setSoundEnabled(v) {
    set({ soundEnabled: v })
    void Preferences.set({ key: KEYS.sound, value: String(v) })
  },
  setHapticsEnabled(v) {
    set({ hapticsEnabled: v })
    void Preferences.set({ key: KEYS.haptics, value: String(v) })
  },
  setReducedMotion(v) {
    set({ reducedMotion: v })
    void Preferences.set({ key: KEYS.motion, value: String(v) })
  },

  async loadSettings() {
    const [sound, haptics, motion] = await Promise.all([
      Preferences.get({ key: KEYS.sound }),
      Preferences.get({ key: KEYS.haptics }),
      Preferences.get({ key: KEYS.motion }),
    ])
    set({
      soundEnabled:   sound.value   !== null ? sound.value   === 'true' : get().soundEnabled,
      hapticsEnabled: haptics.value !== null ? haptics.value === 'true' : get().hapticsEnabled,
      reducedMotion:  motion.value  !== null ? motion.value  === 'true' : get().reducedMotion,
    })
  },
}))
