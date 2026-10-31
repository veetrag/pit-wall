import { z } from 'zod'
import type { PlayerCall } from '@engine/playerCalls'
import type { Compound } from '@engine/types'
import { loadGameData } from '@data/validators'
import { fnv1aBytes } from './fingerprint'
import { buildConfigFromRecipe, type RaceRecipe, type LapsPercent, type WeatherMix } from './raceRecipe'
import {
  CIRCUIT_CODES, DRIVER_CODES, TEAM_CODES, COMPOUND_CODES, PACE_CODES, LAPS_PERCENTS, WEATHER_CODES, ATTRIBUTE_CODES, CALL_KINDS,
} from './startCodes'

export const CODE_FORMAT = 1
export const MAX_CODE_CHARS = 2048
const NAME_RE = /^[\x20-\x7E]{1,24}$/

export interface StartExpect { position: number; lapsRemaining: number; compound: Compound; tyreAge: number; par: number }
export interface StartPayload { fingerprint: number; recipe: RaceRecipe; calls: PlayerCall[]; startLap: number; expect: StartExpect; name: string }
export type DecodeResult = { ok: true; payload: StartPayload; id: string } | { ok: false; reason: 'format' | 'checksum' | 'newer' | 'invalid' }

// ---- bytes -----------------------------------------------------------------

class Writer {
  private out: number[] = []
  u8(v: number) { if (!Number.isInteger(v) || v < 0 || v > 255) throw new RangeError(`u8 ${v}`); this.out.push(v) }
  i8(v: number) { if (!Number.isInteger(v) || v < -128 || v > 127) throw new RangeError(`i8 ${v}`); this.out.push(v & 0xff) }
  u16(v: number) { if (!Number.isInteger(v) || v < 0 || v > 0xffff) throw new RangeError(`u16 ${v}`); this.out.push(v >>> 8, v & 0xff) }
  u32(v: number) { if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) throw new RangeError(`u32 ${v}`); this.out.push(v >>> 24, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff) }
  f64(v: number) { const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, v); for (let i = 0; i < 8; i++) this.out.push(b.getUint8(i)) }
  bytes(): Uint8Array { return Uint8Array.from(this.out) }
}

class Reader {
  private pos = 0
  constructor(private readonly b: Uint8Array) {}
  private need(n: number) { if (this.pos + n > this.b.length) throw new RangeError('short') }
  u8() { this.need(1); return this.b[this.pos++]! }
  i8() { const v = this.u8(); return v > 127 ? v - 256 : v }
  u16() { return (this.u8() << 8) | this.u8() }
  u32() { return ((this.u8() << 24) | (this.u8() << 16) | (this.u8() << 8) | this.u8()) >>> 0 }
  f64() { this.need(8); const v = new DataView(this.b.buffer, this.b.byteOffset + this.pos, 8).getFloat64(0); this.pos += 8; return v }
  done() { return this.pos === this.b.length }
}

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const x of bytes) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function unb64url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4))
    return Uint8Array.from(bin, ch => ch.charCodeAt(0))
  } catch { return null }
}

function idx<T extends string | number>(table: readonly T[], v: T): number {
  const i = table.indexOf(v)
  if (i < 0) throw new RangeError(`not in table: ${String(v)}`)
  return i
}
function at<T>(table: readonly T[], i: number): T {
  const v = table[i]
  if (v === undefined) throw new RangeError(`index ${i}`)
  return v
}

// ---- encode ----------------------------------------------------------------

/** Throws on a payload that cannot be represented (programmer error, never user input). */
export function encodeStart(p: StartPayload): string {
  if (!NAME_RE.test(p.name)) throw new RangeError('name must be 1-24 printable ASCII characters')
  const r = p.recipe
  const w = new Writer()
  w.u8(CODE_FORMAT); w.u32(p.fingerprint >>> 0); w.u32(r.seed >>> 0)
  w.u8(idx(CIRCUIT_CODES, r.circuitId as (typeof CIRCUIT_CODES)[number]))
  w.u8(idx(DRIVER_CODES, r.playerDriverId as (typeof DRIVER_CODES)[number]))
  w.u8(p.startLap)
  w.u8((r.sprint ? 1 : 0) | (r.dryStart ? 2 : 0) | (r.allDry ? 4 : 0) | (r.difficulty === 'pro' ? 8 : 0)
    | (r.strategy ? 16 : 0) | (r.gridOrder ? 32 : 0) | (r.overlay ? 64 : 0))
  w.u8(r.lapsPercent); w.u8(idx(WEATHER_CODES, r.weather))
  if (r.strategy) {
    w.u8(idx(COMPOUND_CODES, r.strategy.startCompound)); w.u8(r.strategy.wing ?? 0); w.u8(r.strategy.plannedStops.length)
    for (const s of r.strategy.plannedStops) { w.u8(s.lap); w.u8(idx(COMPOUND_CODES, s.compound)) }
  }
  if (r.gridOrder) { w.u8(r.gridOrder.length); for (const id of r.gridOrder) w.u8(idx(DRIVER_CODES, id as (typeof DRIVER_CODES)[number])) }
  if (r.overlay) {
    let packed = 0
    ATTRIBUTE_CODES.forEach((a, i) => { packed |= ((r.overlay!.purchasedTiers[a] ?? 0) & 3) << (2 * i) })
    w.u16(packed)
    const rival = Object.entries(r.overlay.rivalDevelopment ?? {})
    w.u8(rival.length); for (const [t, v] of rival) { w.u8(idx(TEAM_CODES, t as (typeof TEAM_CODES)[number])); w.f64(v) }
    const tiers = Object.entries(r.overlay.teamTiers ?? {})
    w.u8(tiers.length); for (const [t, v] of tiers) { w.u8(idx(TEAM_CODES, t as (typeof TEAM_CODES)[number])); w.i8(v) }
  }
  w.u8(p.calls.length)
  for (const c of p.calls) {
    w.u16(c.step); w.u8(idx(CALL_KINDS, c.kind))
    switch (c.kind) {
      case 'pit': case 'restart_tyre': w.u8(idx(COMPOUND_CODES, c.compound)); break
      case 'pace': w.u8(idx(PACE_CODES, c.mode)); break
      case 'hold_plan': w.u8(c.hold ? 1 : 0); break
      default: { const never: never = c; throw new RangeError(String(never)) }
    }
  }
  const e = p.expect
  w.u8(e.position); w.u8(e.lapsRemaining); w.u8(idx(COMPOUND_CODES, e.compound)); w.u8(e.tyreAge); w.u8(e.par)
  w.u8(p.name.length); for (const ch of p.name) w.u8(ch.charCodeAt(0))
  const body = w.bytes()
  const sum = fnv1aBytes(body)
  const all = new Uint8Array(body.length + 4)
  all.set(body); all.set([sum >>> 24, (sum >>> 16) & 0xff, (sum >>> 8) & 0xff, sum & 0xff], body.length)
  return `PW${CODE_FORMAT}-${b64url(all)}`
}

// ---- decode ----------------------------------------------------------------

const PayloadSchema = z.object({
  fingerprint: z.number().int().min(0).max(0xffffffff),
  startLap: z.number().int().min(1).max(255),
  name: z.string().regex(NAME_RE),
  expect: z.object({ position: z.number().int().min(1).max(40), lapsRemaining: z.number().int().min(1), compound: z.enum(COMPOUND_CODES), tyreAge: z.number().int().min(0), par: z.number().int().min(1).max(40) }),
  calls: z.array(z.unknown()).max(255),
  recipe: z.object({ lapsPercent: z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)]) }).passthrough(),
})

function read(bytes: Uint8Array): StartPayload {
  const r = new Reader(bytes)
  r.u8()   // format, checked by the caller
  const fingerprint = r.u32(), seed = r.u32()
  const circuitId = at(CIRCUIT_CODES, r.u8()), playerDriverId = at(DRIVER_CODES, r.u8())
  const startLap = r.u8(), flags = r.u8()
  if (flags & 128) throw new RangeError('flags')
  const lapsPercent = r.u8() as LapsPercent
  if (!(LAPS_PERCENTS as readonly number[]).includes(lapsPercent)) throw new RangeError('laps')
  const weather: WeatherMix = at(WEATHER_CODES, r.u8())
  let strategy: RaceRecipe['strategy'] = null
  if (flags & 16) {
    const startCompound = at(COMPOUND_CODES, r.u8()), wing = r.u8(), n = r.u8()
    if (wing > 5 || n > 2) throw new RangeError('strategy')
    const plannedStops = Array.from({ length: n }, () => ({ lap: r.u8(), compound: at(COMPOUND_CODES, r.u8()) }))
    strategy = { startCompound, plannedStops, ...(wing ? { wing: wing as 1 | 2 | 3 | 4 | 5 } : {}) }
  }
  let gridOrder: string[] | null = null
  if (flags & 32) { const n = r.u8(); gridOrder = Array.from({ length: n }, () => at(DRIVER_CODES, r.u8())) }
  let overlay: RaceRecipe['overlay'] = null
  if (flags & 64) {
    const packed = r.u16()
    const purchasedTiers: Record<string, number> = {}
    ATTRIBUTE_CODES.forEach((a, i) => { const t = (packed >>> (2 * i)) & 3; if (t) purchasedTiers[a] = t })
    if (packed >>> 10) throw new RangeError('tiers')
    const rivalDevelopment: Record<string, number> = {}
    for (let n = r.u8(); n > 0; n--) { const t = at(TEAM_CODES, r.u8()); if (t in rivalDevelopment) throw new RangeError('dup'); rivalDevelopment[t] = r.f64() }
    const teamTiers: Record<string, number> = {}
    for (let n = r.u8(); n > 0; n--) { const t = at(TEAM_CODES, r.u8()); if (t in teamTiers) throw new RangeError('dup'); teamTiers[t] = r.i8() }
    overlay = { purchasedTiers, rivalDevelopment, teamTiers }
  }
  const calls: PlayerCall[] = []
  for (let n = r.u8(); n > 0; n--) {
    const step = r.u16(), kind = at(CALL_KINDS, r.u8()), arg = r.u8()
    switch (kind) {
      case 'pit': calls.push({ step, kind, compound: at(COMPOUND_CODES, arg) }); break
      case 'restart_tyre': calls.push({ step, kind, compound: at(COMPOUND_CODES, arg) }); break
      case 'pace': calls.push({ step, kind, mode: at(PACE_CODES, arg) }); break
      case 'hold_plan': if (arg > 1) throw new RangeError('hold'); calls.push({ step, kind, hold: arg === 1 }); break
      default: { const never: never = kind; throw new RangeError(String(never)) }
    }
  }
  const expect: StartExpect = { position: r.u8(), lapsRemaining: r.u8(), compound: at(COMPOUND_CODES, r.u8()), tyreAge: r.u8(), par: r.u8() }
  let name = ''
  for (let n = r.u8(); n > 0; n--) name += String.fromCharCode(r.u8())
  if (!r.done()) throw new RangeError('trailing bytes')
  const recipe: RaceRecipe = {
    seed, playerDriverId, circuitId, difficulty: flags & 8 ? 'pro' : 'rookie', strategy, overlay, gridOrder,
    dryStart: !!(flags & 2), sprint: !!(flags & 1), allDry: !!(flags & 4), lapsPercent, weather,
  }
  return { fingerprint, recipe, calls, startLap, expect, name }
}

/** The semantic rules (spec §5.4): a code may only describe a race this build can run. */
export function validatePayload(p: StartPayload): boolean {
  if (!PayloadSchema.safeParse(p).success) return false
  const data = loadGameData()
  const r = p.recipe
  if (!data.circuits[r.circuitId] || !data.drivers.drivers.some(d => d.id === r.playerDriverId)) return false
  let laps: number
  try { const c = buildConfigFromRecipe(r); laps = c.lapsOverride ?? c.circuit.laps } catch { return false }
  if (p.startLap > laps - 3) return false
  let prev = 0
  for (const c of p.calls) { if (c.step < prev || c.step >= p.startLap * 3) return false; prev = c.step }
  if (r.gridOrder) {
    const all = data.drivers.drivers.map(d => d.id)
    if (r.gridOrder.length !== all.length || new Set(r.gridOrder).size !== all.length || !all.every(id => r.gridOrder!.includes(id))) return false
  }
  if (r.strategy) {
    let last = 0
    for (const s of r.strategy.plannedStops) { if (s.lap <= last || s.lap >= laps) return false; last = s.lap }
  }
  if (r.overlay) {
    const { min, max } = data.tuning.career.teamTiers
    for (const v of Object.values(r.overlay.rivalDevelopment ?? {})) if (!Number.isFinite(v) || v < 0 || v > 200) return false
    for (const v of Object.values(r.overlay.teamTiers ?? {})) if (v < min || v > max) return false
  }
  return p.expect.par <= data.drivers.drivers.length && p.expect.position <= data.drivers.drivers.length
}

/**
 * Never throws (spec §5.4). Whitespace anywhere is ignored. `validate: false`
 * checks format and checksum only, so a stored start survives a game-data
 * update that makes it unplayable (it is then shown, not deleted).
 */
export function decodeStart(text: string, opts: { validate?: boolean } = {}): DecodeResult {
  try {
    if (typeof text !== 'string' || text.length > MAX_CODE_CHARS) return { ok: false, reason: 'format' }
    const t = text.replace(/\s+/g, '')
    const m = /^PW(\d{1,3})-(.*)$/.exec(t)
    if (!m) return { ok: false, reason: 'format' }
    const version = Number(m[1])
    if (version > CODE_FORMAT) return { ok: false, reason: 'newer' }
    if (version !== CODE_FORMAT) return { ok: false, reason: 'format' }
    const all = unb64url(m[2] ?? '')
    if (!all || all.length < 6) return { ok: false, reason: 'format' }
    const body = all.subarray(0, all.length - 4)
    const sum = ((all[all.length - 4]! << 24) | (all[all.length - 3]! << 16) | (all[all.length - 2]! << 8) | all[all.length - 1]!) >>> 0
    if (fnv1aBytes(body) !== sum) return { ok: false, reason: 'checksum' }
    if (body[0]! > CODE_FORMAT) return { ok: false, reason: 'newer' }
    if (body[0]! !== CODE_FORMAT) return { ok: false, reason: 'format' }
    let payload: StartPayload
    try { payload = read(body) } catch { return { ok: false, reason: 'format' } }
    if (opts.validate !== false && !validatePayload(payload)) return { ok: false, reason: 'invalid' }
    return { ok: true, payload, id: sum.toString(16).padStart(8, '0') }
  } catch {
    return { ok: false, reason: 'format' }
  }
}
