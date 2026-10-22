import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const mem = vi.hoisted(() => new Map<string, string>())
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => { mem.set(key, value) }),
    get: vi.fn(async ({ key }: { key: string }) => ({ value: mem.get(key) ?? null })),
    remove: vi.fn(async ({ key }: { key: string }) => { mem.delete(key) }),
  },
}))

import { useSeasonStore } from '@state/seasonStore'
import { useCareerStore, erodeTiers, type PendingOffer } from '@state/careerStore'
import { snapshotFrom, SeasonSnapshotSchema } from '@state/seasonPersistence'
import { careerSnapshotFrom, CareerSnapshotSchema, CAREER_SAVE_KEY, loadCareer } from '@state/careerPersistence'
import { offerOrder } from '@state/teamOffers'
import { loadGameData } from '@data/validators'

const DATA = loadGameData()
const s = () => useSeasonStore.getState()
const c = () => useCareerStore.getState()
const { order } = offerOrder({})
const teamOf = (id: string) => DATA.drivers.drivers.find(d => d.id === id)!.teamId
const driversOf = (team: string) => DATA.drivers.drivers.filter(d => d.teamId === team).map(d => d.id)

/** A season on its last round, the player in a backmarker seat, every driver on 0 except the player on 400. */
function finalRoundAsUnderdog() {
  const team = order[order.length - 1]!
  const me = driversOf(team)[0]!
  s().startNewSeason()
  s().selectTeam(team); s().confirmTeam()
  s().selectDriver(me); s().confirmDriver()
  useSeasonStore.setState({
    raceIndex: 11, phase: 'result',
    standings: [{ driverId: me, points: 400 }, ...DATA.drivers.drivers.filter(d => d.id !== me).map(d => ({ driverId: d.id, points: 0 }))],
  })
  return { team, me }
}

beforeEach(() => { mem.clear(); s().endCareer() })

describe('season-end offers (spec 1.6 §12)', () => {
  it('an underdog champion is offered a seat stepUp places higher, persisted in the career', () => {
    finalRoundAsUnderdog()
    s().nextRace()
    expect(s().phase).toBe('championship')
    const offer = c().pendingOffer!
    expect(offer.reason).toBe('title')
    expect(offer.teamId).toBe(offerOrder(c().teamTiers).order[offerOrder(c().teamTiers).order.indexOf(teamOf(s().playerDriverId!)) - 2])
    const snap = careerSnapshotFrom(c())!
    expect(Object.keys(snap)[Object.keys(snap).length - 1]).toBe('pendingOffer')
    expect(CareerSnapshotSchema.parse(JSON.parse(JSON.stringify(snap))).pendingOffer).toEqual(offer)
  })

  it('STAY: NEXT SEASON clears the offer and keeps the seat', () => {
    const { me } = finalRoundAsUnderdog()
    s().nextRace()
    s().declineOffer(); s().startNextSeason()
    expect(c().pendingOffer ?? null).toBeNull()
    expect(s().playerDriverId).toBe(me)
  })

  it('ACCEPT: pick a driver of the new team; both ids change together, tiers reset, DP and wing memory carry', () => {
    finalRoundAsUnderdog()
    useSeasonStore.setState({ devPoints: 55, purchasedTiers: { power: 3, pace: 2 } })
    useCareerStore.setState({ wingByCircuit: { bengaluru: 4 } })
    s().nextRace()
    const offer = c().pendingOffer!
    const tiersBefore = { ...c().teamTiers }
    const season = c().seasonNumber
    s().toNewTeamDriver()
    expect(s().phase).toBe('new_team_driver')
    s().acceptOffer('d_not_on_that_team')
    expect(s().phase, 'a driver from another team is refused').toBe('new_team_driver')
    const pick = driversOf(offer.teamId)[1]!
    s().acceptOffer(pick)
    expect(s().phase).toBe('development')
    expect(s().playerDriverId).toBe(pick)
    expect(s().selectedTeamId).toBe(offer.teamId)
    expect(s().purchasedTiers).toEqual({})
    expect(s().devPoints).toBeGreaterThanOrEqual(55)
    expect(c().wingByCircuit).toEqual({ bengaluru: 4 })
    expect(c().teamTiers, 'the ladder is untouched by a transfer').toEqual(tiersBefore)
    expect(c().seasonNumber).toBe(season + 1)
    expect(c().pendingOffer ?? null).toBeNull()
    expect(c().seasonHistory[c().seasonHistory.length - 1]!.teamId, 'the season just raced stays with the old team').not.toBe(offer.teamId)
  })

  it('NEXT SEASON clears the offer only after the season write (a kill in between keeps it)', () => {
    finalRoundAsUnderdog()
    s().nextRace()
    expect(c().pendingOffer).not.toBeNull()
    let offerAtSeasonWrite: PendingOffer | null | undefined
    const unsub = useSeasonStore.subscribe((now, prev) => {
      if (now.phase === 'development' && prev.phase !== 'development') offerAtSeasonWrite = c().pendingOffer ?? null
    })
    s().startNextSeason()
    unsub()
    expect(offerAtSeasonWrite, 'the offer is still there when the season roll is written').not.toBeNull()
    expect(c().pendingOffer ?? null).toBeNull()
  })

  it('APP KILLED ON THE NEW-TEAM DRIVER PICK (Review Focus 2)', async () => {
    finalRoundAsUnderdog()
    s().nextRace()
    const season = c().seasonNumber
    s().toNewTeamDriver()
    const seasonRaw = JSON.stringify(snapshotFrom(s()))
    const careerRaw = JSON.stringify(careerSnapshotFrom(c()))
    expect(JSON.parse(seasonRaw).resumePhase).toBe('championship')
    // kill
    s().endCareer()
    mem.set(CAREER_SAVE_KEY, careerRaw)
    c().resumeCareer((await loadCareer())!)
    s().resumeSeason(SeasonSnapshotSchema.parse(JSON.parse(seasonRaw)))
    expect(s().phase).toBe('championship')
    expect(c().pendingOffer).not.toBeNull()
    expect(c().seasonNumber).toBe(season)
    s().toNewTeamDriver()
    s().acceptOffer(driversOf(c().pendingOffer!.teamId)[0]!)
    expect(c().seasonNumber, 'rolled over exactly once').toBe(season + 1)
  })

  it('a season with no beat earns no offer', () => {
    const { team } = finalRoundAsUnderdog()
    // The bottom-rated team scores nothing: it finishes exactly where it deserved (last).
    useSeasonStore.setState({ standings: DATA.drivers.drivers.map((d, i) => ({ driverId: d.id, points: d.teamId === team ? 0 : 100 - i })) })
    s().nextRace()
    expect(c().pendingOffer ?? null).toBeNull()
  })

  it('a real 1.4 career still serialises byte for byte (no pendingOffer key)', async () => {
    const raw = readFileSync('tests/fixtures/career-save-1.4.json', 'utf8').trim()
    mem.set(CAREER_SAVE_KEY, raw)
    c().resumeCareer((await loadCareer())!)
    expect(JSON.stringify(careerSnapshotFrom(c()))).toBe(raw)
  })

  describe('killed between the career write and the season write (item 15)', () => {
    /** The career rolled (and was saved), the season write never happened. */
    function killMidRoll(): { season: number; tiers: Record<string, number> } {
      finalRoundAsUnderdog()
      useSeasonStore.setState({ purchasedTiers: { power: 3, aero: 2 } })
      s().nextRace()
      const season = c().seasonNumber
      const tiers = { ...s().purchasedTiers }
      c().rollOverSeason(tiers)
      expect(c().seasonNumber).toBe(season + 1)
      expect(s().phase, 'the season write never happened').toBe('championship')
      return { season, tiers }
    }

    it('NEXT SEASON advances the career exactly once and erodes the tiers once', async () => {
      const { season, tiers } = killMidRoll()
      // Round-trip both stores through their saves, as a real resume does.
      const seasonRaw = JSON.stringify(snapshotFrom(s()))
      const careerRaw = JSON.stringify(careerSnapshotFrom(c()))
      s().endCareer()
      mem.set(CAREER_SAVE_KEY, careerRaw)
      c().resumeCareer((await loadCareer())!)
      s().resumeSeason(SeasonSnapshotSchema.parse(JSON.parse(seasonRaw)))
      expect(s().phase).toBe('championship')
      expect(c().seasonNumber, 'the resumed career is already rolled').toBe(season + 1)
      const { tierDecayPerSeason, tierDecayFloor } = DATA.tuning.career
      s().startNextSeason()
      expect(s().phase).toBe('development')
      expect(c().seasonNumber, 'rolled over exactly once').toBe(season + 1)
      expect(s().purchasedTiers).toEqual(erodeTiers(tiers, tierDecayPerSeason, tierDecayFloor))
      expect(c().pendingOffer ?? null).toBeNull()
    })

    it('accept-offer advances the career exactly once and keeps the offer until the season write', () => {
      const { season } = killMidRoll()
      expect(c().pendingOffer, 'the offer survives the half-done roll').not.toBeNull()
      s().toNewTeamDriver()
      const offer = c().pendingOffer!
      s().acceptOffer(driversOf(offer.teamId)[0]!)
      expect(s().phase).toBe('development')
      expect(s().selectedTeamId).toBe(offer.teamId)
      expect(c().seasonNumber, 'rolled over exactly once').toBe(season + 1)
      expect(s().purchasedTiers).toEqual({})
      expect(c().pendingOffer ?? null).toBeNull()
    })

    it('a normal roll still advances by one', () => {
      finalRoundAsUnderdog()
      s().nextRace()
      const season = c().seasonNumber
      s().startNextSeason()
      expect(c().seasonNumber).toBe(season + 1)
    })
  })
})
