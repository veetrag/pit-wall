import { useSettingsStore, type SettingsState } from './settingsStore'

/**
 * Display preferences live on the ROOT element as data attributes, so CSS
 * (tokens.css) does the work and no component re-renders when they change.
 * Spec 1.6 §10 (tyre palette); §11 (text size) adds to this in Task 2.
 */
export function applyDisplaySettings(root: HTMLElement, s: Pick<SettingsState, 'tyrePalette'>): void {
  if (s.tyrePalette === 'cb') root.setAttribute('data-palette', 'cb')
  else root.removeAttribute('data-palette')
}

/** Applies now, then follows the store. Returns an unsubscribe. */
export function startDisplaySettingsSync(root: HTMLElement = document.documentElement): () => void {
  applyDisplaySettings(root, useSettingsStore.getState())
  return useSettingsStore.subscribe(s => applyDisplaySettings(root, s))
}
