import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded' | 'failed'

function base64Of(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, ''))
    r.onerror = () => rej(r.error)
    r.readAsDataURL(blob)
  })
}

/**
 * Android: write to the app cache (served by the manifest's FileProvider
 * cache-path) and open the system share sheet. Web: download the PNG.
 * Nothing leaves the device except what the player chooses to share.
 * Never throws: every failure is an outcome.
 */
export async function sharePng(blob: Blob, fileName: string, title: string): Promise<ShareOutcome> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { uri } = await Filesystem.writeFile({ path: fileName, data: await base64Of(blob), directory: Directory.Cache })
      try {
        await Share.share({ title, files: [uri], dialogTitle: title })
        return 'shared'
      } catch (e) {
        return /cancel/i.test(String(e)) ? 'cancelled' : 'failed'
      }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}
