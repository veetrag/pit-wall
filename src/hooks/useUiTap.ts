import { useHaptics, ImpactStyle } from './useHaptics'
import { soundService } from '@audio/soundService'

// Shared "acknowledge this tap" feedback for menu/nav/settings chrome — a light
// haptic + a subtle tone, distinct from the heavier in-race feedback (pit,
// pace mode) which already has its own dedicated impact styles.
export function useUiTap() {
  const { impact } = useHaptics()
  return function uiTap() {
    impact(ImpactStyle.Light)
    soundService.play('navTap')
  }
}
