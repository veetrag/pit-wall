import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { useSettingsStore } from '@state/settingsStore'

export { ImpactStyle }

export function useHaptics() {
  const hapticsEnabled = useSettingsStore(s => s.hapticsEnabled)

  function impact(style: ImpactStyle = ImpactStyle.Medium) {
    if (!hapticsEnabled) return
    void Haptics.impact({ style }).catch(() => { /* silently fail on web */ })
  }

  function success() {
    if (!hapticsEnabled) return
    void Haptics.notification({ type: NotificationType.Success }).catch(() => {})
  }

  function warning() {
    if (!hapticsEnabled) return
    void Haptics.notification({ type: NotificationType.Warning }).catch(() => {})
  }

  return { impact, success, warning }
}
