import { useMemo } from 'react'
import { motion } from 'framer-motion'
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

function TierPips(
  // `accentRgb` is the CHANNEL form of `accent` (e.g. 'var(--accent-rgb)').
  // rgba() cannot take var(--accent) as its first three arguments, so a
  // translucent version of this colour needs the channels passed alongside it.
  { owned, accent, accentRgb }: { owned: number; accent: string; accentRgb: string },
) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }} aria-hidden>
      {Array.from({ length: MAX_TIERS }, (_, i) => {
        const isOwned = i < owned
        const isNext = i === owned
        return (
          <span
            key={i}
            style={{
              width: 14, height: 5, borderRadius: 3,
              background: isOwned ? accent : 'transparent',
              border: isOwned ? 'none' : `1px solid ${isNext ? 'var(--text-dim)' : 'var(--line-hair)'}`,
              // rgba(var(--x-rgb), 0.4), NOT color-mix(): minSdkVersion is 30 and
              // color-mix needs Chromium 111, so the declaration is DROPPED and
              // this glow silently disappears on exactly the low-end devices
              // this project targets.
              //
              // That is the SECOND time this one channel has been lost to a
              // colour spelling the browser would not parse: it previously read
              // `${accent}66`, which produced the invalid `var(--accent)66`.
              boxShadow: isOwned ? `0 0 6px rgba(${accentRgb}, 0.4)` : 'none',
            }}
          />
        )
      })}
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

  // THREE terminal states, deliberately different in glyph, wording and row
  // treatment — never in colour alone:
  //   maxed      ✓ MAX      all tiers owned, row tinted, stops advertising
  //   spentOut   ⊘ NO GAIN  tiers left but the facet is capped, so nothing to sell
  //   unaffordable ✕ NEED n  still a goal, so it keeps its consequence line
  const accent = maxed ? 'var(--positive)' : 'var(--accent)'
  const accentRgb = maxed ? 'var(--positive-rgb)' : 'var(--accent-rgb)'
  const edge = maxed ? 'var(--positive)'
    : spentOut ? 'var(--text-mid)'
      : canBuy ? 'var(--accent)' : 'var(--line-hair)'

  const label = maxed
    ? `${attr.label}: fully developed, all ${MAX_TIERS} tiers owned`
    : spentOut
      // Must not read as an offer: this tier grants nothing at any price.
      ? `${attr.label} tier ${owned + 1} is unavailable: the facet has reached its development ceiling, so this tier would grant no improvement`
      : `Buy ${attr.label} tier ${owned + 1} of ${MAX_TIERS} for ${cost} development points`
        + (canBuy ? '' : `. Not affordable, ${short} more points needed`)

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        borderRadius: 12,
        background: maxed
          // A 7% --positive tint composited over the solid --bg-elevated.
          //
          // The gradient layer is the portable spelling of color-mix's
          // OPAQUE-BASE blend, which minSdk 30 cannot parse. A bare
          // rgba(var(--positive-rgb), 0.07) would NOT be equivalent: it would
          // make the row 93% transparent over whatever sits behind it, rather
          // than tinting the elevated surface.
          ? 'linear-gradient(rgba(var(--positive-rgb), 0.07), rgba(var(--positive-rgb), 0.07)), var(--bg-elevated)'
          : 'var(--bg-elevated)',
        border: '1px solid var(--line-hair)',
        borderLeft: `2px solid ${edge}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
            color: 'var(--text-hi)', letterSpacing: '0.02em', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {attr.label}
          </span>
          <TierPips owned={owned} accent={accent} accentRgb={accentRgb} />
        </div>
        <div
          data-testid={`effect-${attr.id}`}
          style={{
            marginTop: 3, display: 'flex', alignItems: 'baseline', gap: 5,
            fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.3,
          }}
        >
          {consequence
            ? (
              <>
                <span style={{
                  color: canBuy ? 'var(--accent)' : 'var(--text-mid)', fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {consequence.value}
                </span>
                {/* --text-mid, not --text-dim: this half of the sentence
                    carries WHAT the gain applies to, and #5C6788 on
                    --bg-elevated measures 2.87:1 against the AA floor of
                    4.5 (§6.3). --text-mid measures 6.56:1. */}
                <span style={{ color: 'var(--text-mid)' }}>{consequence.qualifier}</span>
              </>
            )
            : maxed
              ? <span style={{ color: 'var(--positive)' }}>✓ Fully developed — no further gains</span>
              : <span style={{ color: 'var(--text-mid)' }}>⊘ At its ceiling — a further tier would add nothing</span>}
        </div>
      </div>

      <motion.button
        type="button"
        data-testid={`buy-${attr.id}`}
        aria-label={label}
        disabled={!canBuy}
        whileTap={canBuy && !reducedMotion ? { scale: 0.94 } : undefined}
        transition={{ type: 'spring', stiffness: 700, damping: 32 }}
        onClick={onBuy}
        style={{
          flexShrink: 0, minWidth: 74, padding: '9px 10px', borderRadius: 9,
          cursor: canBuy ? 'pointer' : 'default',
          background: canBuy ? 'var(--accent)' : 'transparent',
          border: maxed
            ? '1px solid var(--positive)'
            : spentOut ? '1px solid var(--line-hair)'
              : canBuy ? 'none' : '1px dashed var(--line-hair)',
          color: canBuy ? 'var(--bg-deep)' : maxed ? 'var(--positive)' : 'var(--text-mid)',
          fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700,
          letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        }}
      >
        {maxed
          ? <span>✓ MAX</span>
          : spentOut
            ? (
              <>
                <span>⊘ CAPPED</span>
                <span style={{ fontSize: 8, opacity: 0.75, letterSpacing: '0.08em' }}>NO GAIN</span>
              </>
            )
            : canBuy
              ? (
                <>
                  <span>{cost} DP</span>
                  <span style={{ fontSize: 8, opacity: 0.7, letterSpacing: '0.1em' }}>BUY T{owned + 1}</span>
                </>
              )
              : (
                <>
                  <span>✕ {cost} DP</span>
                  <span style={{ fontSize: 8, letterSpacing: '0.08em', color: 'var(--accent-warm)' }}>NEED {short}</span>
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

  return (
    <motion.div
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 40 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -40 }}
      transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-deep)', position: 'relative',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '20px 20px 14px', borderBottom: '1px solid var(--line-hair)', flexShrink: 0,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>
            {`BETWEEN ROUNDS · ${raceIndex + 1}/${TOTAL_RACES}`}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>
            Development
          </div>
          {(teamTiers[playerTeamId] ?? 0) !== 0 && (() => {
            const t = teamTiers[playerTeamId] ?? 0
            const up = t > 0
            return (
              <div
                aria-label={`Team tier ${up ? '+' : ''}${t}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6,
                  padding: '2px 8px', borderRadius: 999,
                  border: `1px solid ${up ? 'var(--accent)' : 'var(--accent-warm)'}`,
                  color: up ? 'var(--accent)' : 'var(--accent-warm)',
                  fontFamily: 'var(--font-mono)', fontSize: 11, fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '0.08em',
                }}
              >
                {up ? '▲' : '▼'} TIER {up ? '+' : ''}{t}
              </div>
            )
          })()}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div
            data-testid="dp-balance"
            role="status"
            aria-live="polite"
            aria-label={`${devPoints} development points available`}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700,
              color: 'var(--accent)', fontVariantNumeric: 'tabular-nums', lineHeight: 1,
            }}
          >
            {devPoints}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.14em', marginTop: 3 }}>
            POINTS
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* The season arc — the player is not developing in a vacuum */}
        <div
          data-testid="rival-development"
          style={{
            background: 'var(--bg-panel)', border: '1px solid var(--line-hair)',
            borderRadius: 12, padding: '10px 12px',
          }}
        >
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)',
          }}>
            <span>THE ARMS RACE · SEASON TO DATE</span>
            <span
              data-testid="player-arc"
              aria-label={playerArc.label}
              style={{ color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}
            >
              {playerArc.text}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {arc.rivals.map(r => (
              <div key={r.id} style={{
                flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 8,
                background: 'var(--bg-elevated)', border: '1px solid var(--line-hair)',
                borderTop: `2px solid ${r.color}`,
              }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 9.5, color: 'var(--text-mid)',
                  letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {r.name.toUpperCase()}
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, marginTop: 2,
                  color: r.gain > 0 ? 'var(--negative)' : 'var(--text-mid)', fontVariantNumeric: 'tabular-nums',
                }}>
                  {r.gain > 0 ? `−${r.gain.toFixed(2)}s` : '—'}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-mid)', marginTop: 7, lineHeight: 1.4 }}>
            {arc.anyRival
              ? 'Every team develops between rounds. Lap time you do not buy, someone else does.'
              : 'No rival has developed yet. The gap you build now is the gap you defend later.'}
          </div>
        </div>

        {groups.map(group => (
          <div key={group.target}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8,
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-mid)', letterSpacing: '0.16em' }}>
                {group.caption}
              </span>
              <span style={{ flex: 1, height: 1, background: 'var(--line-hair)' }} />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 9.5, color: 'var(--text-mid)' }}>
                {group.note}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
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
      <div style={{ padding: '10px 16px 12px', borderTop: '1px solid var(--line-hair)', flexShrink: 0 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-mid)',
          textAlign: 'center', marginBottom: 8, letterSpacing: '0.04em',
          // This count changes on every purchase, so it gets tabular figures
          // like every other live number on the screen (§6.1).
          fontVariantNumeric: 'tabular-nums',
        }}>
          {devPoints > 0
            ? `${devPoints} unspent points carry over to the next round`
            : `+${UPGRADES.income.perRace} points after every race · +${CAREER.seasonEndBonus[0]} for the title`}
        </div>
        <motion.button
          type="button"
          data-testid="to-race"
          aria-label="Continue to race setup"
          whileTap={reducedMotion ? undefined : { scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 700, damping: 32 }}
          onClick={() => { uiTap(); toRaceSetup() }}
          style={{
            width: '100%', border: 'none', borderRadius: 10, padding: '16px',
            background: 'var(--accent)', color: 'var(--bg-deep)',
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
            letterSpacing: '0.08em', cursor: 'pointer', outline: 'none',
          }}
        >
          TO RACE SETUP →
        </motion.button>
      </div>
    </motion.div>
  )
}
