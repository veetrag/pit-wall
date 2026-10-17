import { describe, it, expect, beforeEach, vi } from 'vitest'

const native = vi.hoisted(() => ({ on: false }))
const fsWrite = vi.hoisted(() => vi.fn(async (_o: { path: string; data: string; directory: string }) => ({ uri: 'file:///cache/card.png' })))
const share = vi.hoisted(() => vi.fn(async (_o: { title: string; files: string[] }) => ({})))
vi.mock('@capacitor/core', async (orig) => ({ ...(await orig<typeof import('@capacitor/core')>()), Capacitor: { isNativePlatform: () => native.on } }))
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { writeFile: fsWrite }, Directory: { Cache: 'CACHE' } }))
vi.mock('@capacitor/share', () => ({ Share: { share } }))

import { sharePng } from '@ui/share/sharePng'

const blob = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })

beforeEach(() => {
  native.on = false; fsWrite.mockClear(); share.mockClear()
  ;(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:x'
  ;(URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {}
})

describe('sharePng (spec 1.6 §6)', () => {
  it('Android: writes the PNG to the cache dir and opens the share sheet with it', async () => {
    native.on = true
    expect(await sharePng(blob(), 'pitwall-p3.png', 'My result')).toBe('shared')
    expect(fsWrite).toHaveBeenCalledWith(expect.objectContaining({ path: 'pitwall-p3.png', directory: 'CACHE' }))
    expect(fsWrite.mock.calls[0]![0].data).toMatch(/^[A-Za-z0-9+/=]+$/)    // base64, no data: prefix
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file:///cache/card.png'] }))
  })
  it('a cancelled share sheet is not a failure', async () => {
    native.on = true
    share.mockRejectedValueOnce(new Error('Share canceled'))
    expect(await sharePng(blob(), 'a.png', 't')).toBe('cancelled')
  })
  it('web: downloads instead, touching no native plugin', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    expect(await sharePng(blob(), 'a.png', 't')).toBe('downloaded')
    expect(click).toHaveBeenCalled()
    expect(fsWrite).not.toHaveBeenCalled()
  })
  it('a write failure is reported, never thrown', async () => {
    native.on = true
    fsWrite.mockRejectedValueOnce(new Error('disk'))
    expect(await sharePng(blob(), 'a.png', 't')).toBe('failed')
  })
})
