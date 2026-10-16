import { describe, it, expect } from 'vitest'
import config from '../../capacitor.config'

/*
 * Found on the 1.4 phone pass: the status-bar icons (clock, battery, signal)
 * rendered DARK on the app's dark ink ground, so they were close to invisible.
 *
 * Capacitor 8's built-in SystemBars plugin applies `plugins.SystemBars.style`
 * natively when it loads, before any JS runs. Left unset it is DEFAULT, which
 * follows the PHONE's light/dark mode, not the app's: a phone in light mode
 * got dark icons over our permanently dark UI.
 *
 * The naming is inverted from what it reads like, so pinned here: in
 * Capacitor, style "DARK" means LIGHT icons for a DARK background
 * (SystemBars.java: setAppearanceLightStatusBars(!style.equals("DARK"))).
 * "LIGHT" would be exactly the bug.
 */
describe('system bars', () => {
  it('USE LIGHT ICONS (style DARK) WHATEVER THE PHONE THEME', () => {
    const systemBars = config.plugins?.SystemBars as { style?: string } | undefined
    expect(systemBars?.style, 'unset or DEFAULT follows the phone theme, not the app').toBe('DARK')
  })
})
