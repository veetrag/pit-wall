import { create } from 'zustand'
import { Preferences } from '@capacitor/preferences'

export type SimSpeed = 1 | 2 | 4
export type Difficulty = 'rookie' | 'pro'
export type DriverNameFormat = 'code' | 'full'
/** Spec 1.6 §10: 'cb' sets data-palette="cb" on the root, overriding only the tyre tokens. */
export type TyrePalette = 'standard' | 'cb'

export interface SettingsState {
  soundEnabled: boolean
  hapticsEnabled: boolean
  reducedMotion: boolean
  /*
   * Whether the PLAYER has made an explicit reduced-motion choice, as opposed
   * to inheriting the OS preference. Deliberately not persisted -- it is
   * derived from whether the stored key exists. It exists so an OS-level change
   * can be followed WITHOUT overruling someone who set the toggle themselves.
   */
  motionPreferenceStored: boolean
  simSpeed: SimSpeed
  proMode: boolean
  skipStartSequence: boolean
  difficulty: Difficulty
  driverNameFormat: DriverNameFormat
  coachMarksSeen: boolean
  tyrePalette: TyrePalette
  setSoundEnabled: (v: boolean) => void
  setHapticsEnabled: (v: boolean) => void
  setReducedMotion: (v: boolean) => void
  setSimSpeed: (v: SimSpeed) => void
  setProMode: (v: boolean) => void
  setSkipStartSequence: (v: boolean) => void
  setDifficulty: (v: Difficulty) => void
  setDriverNameFormat: (v: DriverNameFormat) => void
  setCoachMarksSeen: (v: boolean) => void
  setTyrePalette: (v: TyrePalette) => void
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
  driverNameFormat: 'settings.driverNameFormat',
  coachMarksSeen: 'settings.coachMarksSeen',
  tyrePalette: 'settings.tyrePalette',
}

/**
 * The OS-level accessibility preference.
 *
 * Guarded: jsdom has no matchMedia, and this module is imported by tests that
 * never touch a DOM.
 */
export function osPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export const useSettingsStore = create<SettingsState>((set) => ({
  soundEnabled: true,
  hapticsEnabled: true,
  reducedMotion: false,
  motionPreferenceStored: false,
  simSpeed: 1,
  proMode: false,
  skipStartSequence: false,
  difficulty: 'rookie',
  driverNameFormat: 'code',
  coachMarksSeen: false,
  tyrePalette: 'standard',

  setSoundEnabled(v) { set({ soundEnabled: v }); void Preferences.set({ key: K.sound, value: String(v) }) },
  setHapticsEnabled(v) { set({ hapticsEnabled: v }); void Preferences.set({ key: K.haptics, value: String(v) }) },
  setReducedMotion(v) { set({ reducedMotion: v, motionPreferenceStored: true }); void Preferences.set({ key: K.motion, value: String(v) }) },
  setSimSpeed(v) { set({ simSpeed: v }); void Preferences.set({ key: K.simSpeed, value: String(v) }) },
  setProMode(v) { set({ proMode: v }); void Preferences.set({ key: K.proMode, value: String(v) }) },
  setSkipStartSequence(v) { set({ skipStartSequence: v }); void Preferences.set({ key: K.skipStart, value: String(v) }) },
  setDifficulty(v) { set({ difficulty: v }); void Preferences.set({ key: K.difficulty, value: v }) },
  setDriverNameFormat(v) { set({ driverNameFormat: v }); void Preferences.set({ key: K.driverNameFormat, value: v }) },
  setCoachMarksSeen(v) { set({ coachMarksSeen: v }); void Preferences.set({ key: K.coachMarksSeen, value: String(v) }) },
  setTyrePalette(v) { set({ tyrePalette: v }); void Preferences.set({ key: K.tyrePalette, value: v }) },

  async loadSettings() {
    const keys = Object.values(K)
    const results = await Promise.all(keys.map(k => Preferences.get({ key: k })))
    const [sound, haptics, motion, simSpeed, proMode, skipStart, difficulty, driverNameFormat, coachMarksSeen, tyrePalette] = results.map(r => r.value)
    set({
      soundEnabled:      sound     != null ? sound     === 'true' : true,
      hapticsEnabled:    haptics   != null ? haptics   === 'true' : true,
      // The OS preference is the DEFAULT, not an override: an explicit stored
      // choice still wins. Before this, someone with reduce-motion set at the
      // system level got the full motion language until they found the in-app
      // toggle -- and tokens.css's @media block does not help, because it only
      // neutralises CSS animations and this app animates from JS.
      reducedMotion:     motion    != null ? motion    === 'true' : osPrefersReducedMotion(),
      motionPreferenceStored: motion != null,
      simSpeed:          simSpeed  != null ? (Number(simSpeed) as SimSpeed) : 1,
      proMode:           proMode   != null ? proMode   === 'true' : false,
      skipStartSequence: skipStart != null ? skipStart === 'true' : false,
      difficulty:        difficulty === 'pro' ? 'pro' : 'rookie',
      driverNameFormat:  driverNameFormat === 'full' ? 'full' : 'code',
      coachMarksSeen:    coachMarksSeen != null ? coachMarksSeen === 'true' : false,
      tyrePalette:       tyrePalette === 'cb' ? 'cb' : 'standard',
    })
  },
}))

/**
 * Keeps reduced motion in step with the OS while the app is open; returns an
 * unsubscribe.
 *
 * Gated on motionPreferenceStored: a player who has set the toggle themselves
 * owns that setting, and an OS-level change must not silently overrule them.
 * Without the gate this would be an override rather than a default, and would
 * quietly re-enable motion for someone who had deliberately turned it off.
 */
export function startReducedMotionWatch(): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  const onChange = (e: MediaQueryListEvent) => {
    if (useSettingsStore.getState().motionPreferenceStored) return
    useSettingsStore.setState({ reducedMotion: e.matches })
  }
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
