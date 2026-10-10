import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { EASE, PRESS, ScreenFrame, ScreenHeader, KitButton, Pill } from '@ui/kit'
import { useUiTap } from '@hooks/useUiTap'
import { useSettingsStore } from '@state/settingsStore'
import { useCareerStore } from '@state/careerStore'
import { useSeasonStore, TOTAL_RACES } from '@state/seasonStore'
import { applyUpgrades, rivalFacetValue } from '@state/upgradeOverlay'
import { loadGameData, type UpgradeAttribute } from '@data/validators'

const GAME = loadGameData()
const TUNING = GAME.tuning
const UPGRADES = GAME.upgrades
// The podium bonus belongs on this screen: it is the only other source of
// development points, and a player deciding what to buy should know the
// championship is worth more than a race.
const CAREER = TUNING.career
const MAX_TIERS = UPGRADES.tierCosts.length

// ---------------------------------------------------------------------------
// Consequence maths
//
// §4 of the spec: never show the player "+3 aero". A facet point is an
// internal, un-normalised quantity — 3 points of aero and 3 points of pace buy
// completely different amounts of lap time — so the raw delta is not just
// unhelpful, it is actively misleading when comparing two rows.
//
// Everything below is DERIVED from data/tuning.json using the same arithmetic
// engine/lapModel.ts and engine/race.ts perform, so a designer retuning
// tuning.json or upgrades.json moves these numbers without a code change
// (CLAUDE.md §5). Nothing here is a hand-written lookup table.
// ---------------------------------------------------------------------------

// lapModel.facetToRating9: rating = (1 - facet/100) * 9, so one facet point is
// worth 9/100 of a rating point (and the sign flips — more facet, less time).
const RATING_PER_FACET_POINT = 9 / 100
// lapModel rescales the driver 0-9 rating to 0-10 before applying
// deltaPerSkill, which makes one pace point worth 10/100 of a skill point.
const SKILL_PER_FACET_POINT = 10 / 100

// Which sector each car facet governs — lapModel.ts line 28's
// `[tf.power, tf.aero, tf.handling][sector]`. A car facet therefore only
// affects ONE of the three sectors, which is why aero (0.45 of the lap) buys
// more per point than handling (0.25).
const CAR_FACET_SECTOR: Record<string, 0 | 1 | 2> = { power: 0, aero: 1, handling: 2 }

/**
 * Seconds of lap time one point of `facet` is worth. Returns 0 for facets that
 * do not enter the lap-time model at all (reliability, pitCrew...).
 */
function secondsPerLapPerPoint(facet: string): number {
  const sector = CAR_FACET_SECTOR[facet]
  if (sector !== undefined) {
    const split = TUNING.carPerformance.sectorSplit[sector]
    return RATING_PER_FACET_POINT * TUNING.carPerformance.deltaPerRating * split * 3
  }
  if (facet === 'pace') {
    // The pace facet governs all three sectors, so its weights sum.
    const split = TUNING.driverPerformance.sectorSplit.reduce((a, b) => a + b, 0)
    return SKILL_PER_FACET_POINT * TUNING.driverPerformance.deltaPerSkill * split * 3
  }
  return 0
}

interface Consequence {
  /** The headline gain, e.g. "−0.09s/lap". */
  value: string
  /** What the gain applies to, e.g. "race pace". */
  qualifier: string
}

/**
 * Turns a facet delta into a sentence about the player's race, using the real
 * pre- and post-purchase facet values (so a facet already near the 100 ceiling
 * honestly reports the smaller gain it will actually deliver).
 */
function describeConsequence(attr: UpgradeAttribute, before: number, after: number): Consequence {
  const delta = after - before
  switch (attr.unit) {
    case 'laptime': {
      const secs = secondsPerLapPerPoint(attr.facet) * delta
      return { value: `−${secs.toFixed(2)}s/lap`, qualifier: attr.target === 'team' ? 'car pace' : 'race pace' }
    }
    case 'failureRisk': {
      // race.ts: perLap = baseChancePerLap * (1 - reliability/100).
      const riskBefore = 1 - before / 100
      const riskAfter = 1 - after / 100
      if (riskAfter <= 0) return { value: 'No failures', qualifier: 'mechanical DNFs ruled out' }
      const cut = riskBefore > 0 ? (1 - riskAfter / riskBefore) * 100 : 0
      // Relative, not percentage points — the qualifier's "less likely" is what
      // stops a reader over-reading it as an absolute cut.
      return { value: `−${Math.round(cut)}%`, qualifier: 'less likely to suffer a mechanical failure' }
    }
    default: {
      const exhaustive: never = attr.unit
      return exhaustive
    }
  }
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface RowProps {
  attr: UpgradeAttribute
  owned: number
  cost: number | null
  affordable: number
  onBuy: () => void
  before: number
  after: number
  reducedMotion: boolean
}

function TierMarks({ owned }: { owned: number }) {
  return (
    <div role="img" aria-label={`Tier ${owned} of ${MAX_TIERS}`} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {Array.from({ length: MAX_TIERS }, (_, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            width: 14, height: 8, transform: 'skewX(-12deg)',
            background: i < owned ? 'var(--volt)' : 'var(--dusk)',
          }}
        />
      ))}
    </div>
  )
}

function AttributeRow({ attr, owned, cost, affordable, onBuy, before, after, reducedMotion }: RowProps) {
  const maxed = cost === null
  // Tiers remain, but the facet is already at its ceiling (attr.facetMax, or
  // the global 100) so the next tier moves nothing. Without this the row sold a
  // 30 DP package that displayed "−0.00s/lap": technically truthful, a trap in
  // practice. `before`/`after` come from the same overlay the engine reads, so
  // this is the real delta the purchase would produce, not an estimate.
  const spentOut = !maxed && after === before
  const short = cost === null ? 0 : Math.max(0, cost - affordable)
  const canBuy = !maxed && !spentOut && short === 0
  const consequence = maxed || spentOut ? null : describeConsequence(attr, before, after)

  // Terminal states differ in glyph and wording, never in colour alone:
  //   maxed      ✓ MAX     all tiers owned
  //   spentOut   CAPPED    tiers left but the facet is capped, nothing to sell
  //   unaffordable NEED n  still a goal, keeps its consequence line
  const label = maxed
    ? `${attr.label}: fully developed, all ${MAX_TIERS} tiers owned`
    : spentOut
      // Must not read as an offer: this tier grants nothing at any price.
      ? `${attr.label} tier ${owned + 1} is unavailable: the facet has reached its development ceiling, so this tier would grant no improvement`
      : `Buy ${attr.label} tier ${owned + 1} of ${MAX_TIERS} for ${cost} development points`
        + (canBuy ? '' : `. Not affordable, ${short} more points needed`)

  const buyFill = canBuy ? 'var(--volt)' : maxed || spentOut ? 'transparent' : 'var(--dusk)'
  const buyText = canBuy ? 'var(--ink)' : maxed || spentOut ? 'var(--lilac-dim)' : 'var(--lilac)'

  return (
    <div
      className="slant-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px', background: 'var(--grape)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, fontStyle: 'italic',
          textTransform: 'uppercase', color: 'var(--white)', lineHeight: 1.05, overflowWrap: 'anywhere',
        }}>
          {attr.label}
        </div>
        <div style={{ marginTop: 6 }}><TierMarks owned={owned} /></div>
        {/* Keyed on the owned count so a purchase re-enters the line with the
            new before→after consequence: a short slide on EASE, no spring. */}
        <motion.div
          key={owned}
          data-testid={`effect-${attr.id}`}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
          transition={{ duration: reducedMotion ? 0.12 : 0.18, ease: EASE }}
          style={{
            marginTop: 6, fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700,
            lineHeight: 1.3, color: 'var(--gain)', fontVariantNumeric: 'tabular-nums',
          }}
        >
          {consequence
            ? <>{consequence.value} <span style={{ fontWeight: 500, color: 'var(--lilac)' }}>{consequence.qualifier}</span></>
            : maxed
              ? '✓ Fully developed — no further gains'
              : '⊘ At its ceiling — a further tier would add nothing'}
        </motion.div>
      </div>

      <motion.button
        type="button"
        data-testid={`buy-${attr.id}`}
        aria-label={label}
        disabled={!canBuy}
        className="slant-sm kit-focus"
        whileTap={canBuy && !reducedMotion ? { scale: 0.96 } : undefined} transition={PRESS}
        onClick={onBuy}
        style={{
          flexShrink: 0, width: 88, height: 52, border: 'none', padding: 0,
          cursor: canBuy ? 'pointer' : 'default',
          background: buyFill, color: buyText,
          fontFamily: 'var(--font-body)', fontVariantNumeric: 'tabular-nums',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
        }}
      >
        {maxed
          ? <span style={{ fontWeight: 800, fontSize: 14 }}>✓ MAX</span>
          : spentOut
            ? <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>CAPPED</span>
            : canBuy
              ? (
                <>
                  <span style={{ fontWeight: 800, fontSize: 16 }}>{cost} DP</span>
                  <span style={{ fontWeight: 700, fontSize: 10, letterSpacing: 1 }}>BUY T{owned + 1}</span>
                </>
              )
              : (
                <>
                  <span style={{ fontWeight: 800, fontSize: 16 }}>{cost} DP</span>
                  <span style={{ fontWeight: 700, fontSize: 10, letterSpacing: 1 }}>NEED {short}</span>
                </>
              )}
      </motion.button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function Development() {
  const uiTap = useUiTap()
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const devPoints = useSeasonStore(s => s.devPoints)
  const purchasedTiers = useSeasonStore(s => s.purchasedTiers)
  const rivalDevelopment = useSeasonStore(s => s.rivalDevelopment)
  const raceIndex = useSeasonStore(s => s.raceIndex)
  const playerDriverId = useSeasonStore(s => s.playerDriverId)
  const purchaseTier = useSeasonStore(s => s.purchaseTier)
  const tierCost = useSeasonStore(s => s.tierCost)
  const toRaceSetup = useSeasonStore(s => s.toRaceSetup)

  const teamTiers = useCareerStore(s => s.teamTiers)

  const playerTeamId = useMemo(
    () => GAME.drivers.drivers.find(d => d.id === playerDriverId)?.teamId ?? '',
    [playerDriverId],
  )

  // Current and next-tier facet values, produced by the SAME overlay the race
  // builder uses (state/upgradeOverlay.ts) rather than re-implementing facet
  // arithmetic here. That is what guarantees the number shown on this screen is
  // the number the engine will actually receive — including the 100-facet
  // ceiling, which quietly shrinks the last tier of an already-strong facet.
  const facetPairs = useMemo(() => {
    function facetsWith(tiers: Record<string, number>, target: UpgradeAttribute['target']): Record<string, number> {
      if (target === 'team') {
        const teams = applyUpgrades(GAME.cars.teams, {
          attributes: UPGRADES.attributes, purchasedTiers: tiers, target: 'team',
          appliesTo: t => t.id === playerTeamId,
          teamTiers,
        })
        return teams.find(t => t.id === playerTeamId)?.facets ?? {}
      }
      const drivers = applyUpgrades(GAME.drivers.drivers, {
        attributes: UPGRADES.attributes, purchasedTiers: tiers, target: 'driver',
        appliesTo: d => d.id === playerDriverId,
      })
      return drivers.find(d => d.id === playerDriverId)?.facets ?? {}
    }

    const out = new Map<string, { base: number; before: number; after: number }>()
    for (const attr of UPGRADES.attributes) {
      const owned = purchasedTiers[attr.id] ?? 0
      const base = facetsWith({}, attr.target)[attr.facet] ?? 0
      const before = facetsWith(purchasedTiers, attr.target)[attr.facet] ?? 0
      const after = facetsWith({ ...purchasedTiers, [attr.id]: owned + 1 }, attr.target)[attr.facet] ?? 0
      out.set(attr.id, { base, before, after })
    }
    return out
  }, [purchasedTiers, playerTeamId, playerDriverId, teamTiers])

  // The season arc, in one line: how much lap time the player has bought so far
  // versus how much the rivals have developed while they were doing it.
  const arc = useMemo(() => {
    const playerGain = UPGRADES.attributes
      .filter(a => a.unit === 'laptime')
      .reduce((sum, a) => {
        const pair = facetPairs.get(a.id)
        if (!pair) return sum
        // `before` includes the tiers already owned; `base` is the un-upgraded
        // data value, so their difference is exactly what the player has bought.
        return sum + secondsPerLapPerPoint(a.facet) * (pair.before - pair.base)
      }, 0)

    // Tiers bought on attributes that do NOT enter the lap-time model. Without
    // this, a player whose only purchase was Reliability saw "YOU —" next to
    // rivals' concrete numbers, which reads as "you have bought nothing" — a
    // flat misstatement of a real, paid-for gain. `playerGain` can only ever
    // account for laptime attributes, so the count is what makes the row honest.
    const otherTiers = UPGRADES.attributes
      .filter(a => a.unit !== 'laptime')
      .reduce((n, a) => n + (purchasedTiers[a.id] ?? 0), 0)

    const rivals = GAME.cars.teams
      .filter(t => t.id !== playerTeamId)
      .map(team => {
        const pool = rivalDevelopment[team.id] ?? 0
        const gain = UPGRADES.rivalDevelopment.facets.reduce((sum, facet) => {
          const base = team.facets[facet as keyof typeof team.facets]
          if (base === undefined) return sum
          return sum + secondsPerLapPerPoint(facet) * (rivalFacetValue(base, pool, facet) - base)
        }, 0)
        return { id: team.id, name: team.name, color: team.colorPrimary, gain }
      })
      .sort((a, b) => b.gain - a.gain)

    return { playerGain, otherTiers, rivals: rivals.slice(0, 3), anyRival: rivals.some(r => r.gain > 0) }
  }, [facetPairs, purchasedTiers, rivalDevelopment, playerTeamId])

  // What the player's side of the arms-race row says. A signed zero ("−0.00s")
  // reads as a measurement rather than as "nothing bought yet", so a pure
  // non-laptime spend gets its own wording instead of being rounded away.
  const playerArc = arc.playerGain > 0
    ? {
      text: `YOU \u2212${arc.playerGain.toFixed(2)}s`,
      label: `You have bought ${arc.playerGain.toFixed(2)} seconds per lap`
        + (arc.otherTiers > 0 ? `, plus ${arc.otherTiers} upgrade tier${arc.otherTiers === 1 ? '' : 's'} that improve reliability rather than lap time` : ''),
    }
    : arc.otherTiers > 0
      ? {
        text: `YOU ${arc.otherTiers} UPG`,
        label: `You have bought ${arc.otherTiers} upgrade tier${arc.otherTiers === 1 ? '' : 's'}. `
          + 'They improve reliability rather than lap time, so they do not show as a lap-time gain.',
      }
      : { text: 'YOU \u2014', label: 'You have not bought any upgrades yet' }

  const groups: { caption: string; note: string; target: UpgradeAttribute['target'] }[] = [
    { caption: 'THE CAR', note: 'Shared with your team-mate', target: 'team' },
    { caption: 'THE DRIVER', note: 'Yours alone', target: 'driver' },
  ]

  const teamTier = teamTiers[playerTeamId] ?? 0

  return (
    <ScreenFrame label="Development">
      <ScreenHeader
        eyebrow={`BETWEEN ROUNDS · ${raceIndex + 1} OF ${TOTAL_RACES}`}
        title="The factory"
        right={(
          <div
            data-testid="dp-balance"
            role="status"
            aria-live="polite"
            aria-label={`${devPoints} development points available`}
            className="slant-sm"
            style={{
              background: 'var(--volt)', color: 'var(--ink)', padding: '6px 14px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0,
            }}
          >
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 900, fontStyle: 'italic',
              lineHeight: 1, fontVariantNumeric: 'tabular-nums',
            }}>{devPoints}</span>
            <span style={{ fontWeight: 800, fontSize: 11, letterSpacing: 1 }}>DEV POINTS</span>
          </div>
        )}
      />
      {teamTier !== 0 && (
        <div style={{ padding: '8px 16px 0', flexShrink: 0 }}>
          <Pill ariaLabel={`Team tier ${teamTier > 0 ? '+' : ''}${teamTier}`}>
            <span style={{ color: teamTier > 0 ? 'var(--gain)' : 'var(--hot)', fontVariantNumeric: 'tabular-nums' }}>
              {teamTier > 0 ? '▲' : '▼'} TIER {teamTier > 0 ? '+' : ''}{teamTier}
            </span>
          </Pill>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* The season arc: the player is not developing in a vacuum */}
        <div
          data-testid="rival-development"
          className="slant-lg"
          style={{ background: 'var(--night)', padding: '14px 16px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 800, fontSize: 12, letterSpacing: 2, color: 'var(--hot)' }}>THE ARMS RACE</span>
            <span style={{ fontSize: 12, color: 'var(--lilac-dim)' }}>season to date</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginTop: 10 }}>
            {arc.rivals.map(r => (
              <div key={r.id} style={{ minWidth: 0 }}>
                <div style={{ height: 4, background: r.color, transform: 'skewX(-12deg)' }} />
                <div style={{ fontSize: 11, color: 'var(--lilac)', marginTop: 6, overflowWrap: 'anywhere' }}>
                  {r.name.split(' ')[0]}
                </div>
                <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--hot)', fontVariantNumeric: 'tabular-nums' }}>
                  {r.gain > 0 ? `−${r.gain.toFixed(2)}s` : '—'}
                </div>
              </div>
            ))}
            <div style={{ minWidth: 0, gridColumn: 4 }}>
              <div style={{ height: 4, background: 'var(--volt)', transform: 'skewX(-12deg)' }} />
              <div style={{ fontSize: 11, color: 'var(--lilac)', marginTop: 6 }}>You</div>
              <div
                data-testid="player-arc"
                aria-label={playerArc.label}
                style={{ fontWeight: 800, fontSize: 16, color: 'var(--volt)', fontVariantNumeric: 'tabular-nums' }}
              >
                {playerArc.text}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--lilac-dim)', marginTop: 10, lineHeight: 1.4 }}>
            {arc.anyRival
              ? 'Every team develops between rounds. Lap time you do not buy, someone else does.'
              : 'No rival has developed yet. The gap you build now is the gap you defend later.'}
          </div>
        </div>

        {groups.map(group => (
          <div key={group.target}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20,
                textTransform: 'uppercase', color: 'var(--lilac-dim)',
              }}>
                {group.caption}
              </span>
              <span style={{ fontSize: 13, color: 'var(--lilac-dim)' }}>{group.note}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {UPGRADES.attributes.filter(a => a.target === group.target).map(attr => {
                const pair = facetPairs.get(attr.id) ?? { base: 0, before: 0, after: 0 }
                return (
                  <AttributeRow
                    key={attr.id}
                    attr={attr}
                    owned={purchasedTiers[attr.id] ?? 0}
                    cost={tierCost(attr.id)}
                    affordable={devPoints}
                    before={pair.before}
                    after={pair.after}
                    reducedMotion={reducedMotion}
                    onBuy={() => { uiTap(); purchaseTier(attr.id) }}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Skippable by design: unspent points bank. */}
      <div style={{ padding: '10px 16px calc(12px + var(--safe-bottom, 0px))', flexShrink: 0 }}>
        <div style={{
          fontSize: 13, color: 'var(--lilac-dim)', textAlign: 'center', marginBottom: 10,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {devPoints > 0
            ? `${devPoints} unspent points carry over to the next round`
            : `+${UPGRADES.income.perRace} points after every race · +${CAREER.seasonEndBonus[0]} for the title`}
        </div>
        <KitButton
          variant="primary" size="lg" testId="to-race" ariaLabel="Continue to race setup"
          onClick={toRaceSetup} style={{ width: '100%' }}
        >
          TO RACE SETUP →
        </KitButton>
      </div>
    </ScreenFrame>
  )
}
