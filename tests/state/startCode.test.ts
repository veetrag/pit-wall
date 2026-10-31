import { describe, it, expect } from 'vitest'
import { encodeStart, decodeStart, MAX_CODE_CHARS } from '@state/startCode'
import { CIRCUIT_CODES, DRIVER_CODES, TEAM_CODES, ATTRIBUTE_CODES } from '@state/startCodes'
import { loadGameData } from '@data/validators'
import { FULL, MINIMAL } from '../fixtures/startPayloads'

const DATA = loadGameData()

describe('share code round trip', () => {
  for (const [label, p] of [['full', FULL], ['minimal', MINIMAL]] as const) {
    it(`${label}: decode(encode(p)) is p, exactly (f64 pools included)`, () => {
      const code = encodeStart(p)
      expect(code.startsWith('PW1-')).toBe(true)
      expect(code).toMatch(/^PW1-[A-Za-z0-9_-]+$/)
      const back = decodeStart(code)
      expect(back.ok).toBe(true)
      if (back.ok) expect(back.payload).toEqual(p)
    })
  }
  it('is compact: the full payload is under 400 characters', () => {
    expect(encodeStart(FULL).length).toBeLessThan(400)
  })
  it('ignores whitespace and line breaks a chat app inserts', () => {
    const code = encodeStart(FULL)
    const wrapped = `  ${code.slice(0, 40)}\n${code.slice(40, 90)} \r\n${code.slice(90)}  `
    expect(decodeStart(wrapped)).toEqual(decodeStart(code))
  })
  it('gives a stable id from the checksum', () => {
    const a = decodeStart(encodeStart(FULL)), b = decodeStart(encodeStart(FULL))
    expect(a.ok && b.ok && a.id === b.id && /^[0-9a-f]{8}$/.test(a.id)).toBe(true)
  })
  // FORMAT STABILITY: pinned from the first green run (print with --reporter=verbose,
  // paste into GOLDEN). A change here means every shared code broke: bump the
  // format instead.
  const GOLDEN = 'PW1-AQAAAAEAAAAAAAABB2QAAAERAAECAXinMNDn'
  it('PINNED GOLDEN CODE', () => {
    expect(encodeStart(MINIMAL)).toBe(GOLDEN)
  })
})

describe('rejections', () => {
  it('a newer format is "newer", not "format"', () => {
    expect(decodeStart('PW2-AAAA')).toEqual({ ok: false, reason: 'newer' })
  })
  it('junk is "format"', () => {
    for (const s of ['', 'hello', 'PW1-', 'PW1-!!!!', 'PW1-AAAA', 'PWx-AAAA']) expect(decodeStart(s)).toEqual({ ok: false, reason: 'format' })
  })
  it('refuses oversized input before decoding it', () => {
    expect(decodeStart('PW1-' + 'A'.repeat(MAX_CODE_CHARS))).toEqual({ ok: false, reason: 'format' })
  })
  it('a well-formed, checksummed code describing an impossible race is "invalid"', () => {
    const bad = { ...FULL, startLap: 200 }
    expect(decodeStart(encodeStart(bad))).toEqual({ ok: false, reason: 'invalid' })
    const dupGrid = { ...FULL, recipe: { ...FULL.recipe, gridOrder: [...FULL.recipe.gridOrder!.slice(1), FULL.recipe.gridOrder![1]!] } }
    expect(decodeStart(encodeStart(dupGrid))).toEqual({ ok: false, reason: 'invalid' })
    const lateCall = { ...FULL, calls: [...FULL.calls, { step: 35 * 3, kind: 'pace' as const, mode: 'push' as const }] }
    expect(decodeStart(encodeStart(lateCall))).toEqual({ ok: false, reason: 'invalid' })
  })
  it('refuses to encode a name outside printable ASCII or over 24 characters', () => {
    expect(() => encodeStart({ ...FULL, name: 'é' })).toThrow()
    expect(() => encodeStart({ ...FULL, name: 'x'.repeat(25) })).toThrow()
  })
})

describe('code tables are append-only', () => {
  it('pins the 2.0 orders', () => {
    expect(CIRCUIT_CODES.slice(0, 14)).toEqual(['bengaluru', 'monsoon_bay', 'veloce', 'harbour_lights', 'sol_desert', 'highland', 'grand_savane', 'aurora', 'silverpark', 'costa_verde', 'kaido', 'altiplano', 'lantern_quay', 'mesa_roja'])
    expect(DRIVER_CODES.slice(0, 20)).toEqual(['d_voss', 'd_chen', 'd_rossi', 'd_haas', 'd_silva', 'd_park', 'd_berg', 'd_almeida', 'd_novak', 'd_ito', 'd_dubois', 'd_mwangi', 'd_olsen', 'd_reyes', 'd_fischer', 'd_kovac', 'd_santos', 'd_tan', 'd_petrov', 'd_kane'])
    expect(TEAM_CODES.slice(0, 10)).toEqual(['apex', 'meridian', 'vortex', 'kestrel', 'solstice', 'delta', 'halcyon', 'nimbus', 'terra', 'zenith'])
    expect(ATTRIBUTE_CODES).toEqual(['power', 'aero', 'handling', 'reliability', 'pace'])
  })
  it('covers every circuit, driver, team and attribute in the data', () => {
    for (const id of Object.keys(DATA.circuits)) expect(CIRCUIT_CODES, id).toContain(id)
    for (const d of DATA.drivers.drivers) expect(DRIVER_CODES, d.id).toContain(d.id)
    for (const t of DATA.cars.teams) expect(TEAM_CODES, t.id).toContain(t.id)
    for (const a of DATA.upgrades.attributes) expect(ATTRIBUTE_CODES, a.id).toContain(a.id)
  })
})
