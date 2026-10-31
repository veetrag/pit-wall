import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useSettingsStore } from '@state/settingsStore'
import { useSeasonStore, TOTAL_RACES, raceHeadline, addResultsToStandings } from '@state/seasonStore'
import { useUiTap } from '@hooks/useUiTap'
import { loadGameData } from '@data/validators'
import { BADGES } from '@state/badges'
import { BadgeToast } from './BadgeToast'
import { DebriefCard } from './DebriefCard'
import { LapChartCard } from './LapChart'
import { HelmetAvatar } from './HelmetAvatar'
import { HeroBand, KitButton, Pill, liveryOf, snapIn, useCountUp, useReducedMotion, ScreenFrame } from '@ui/kit'
import { useDebriefStore } from '@state/debriefStore'
import { useCareerStore } from '@state/careerStore'
import { ShareButton } from './share/ShareButton'
import { MakeStartSheet } from './MakeStartSheet'
import { buildShareData } from './share/shareCard'
import driversData from '@data/drivers.json'
import carsData from '@data/cars.json'

// See the note in TelemetryZone.tsx: a two-branch ternary here reported every
// crash as "a puncture". Keyed so a new retiredCause fails to compile.
const RETIREMENT_HEADLINE: Record<'tyre' | 'mechanical' | 'crash', string> = {
  tyre: 'Retired — a puncture ended the race early.',
  mechanical: 'Retired — a mechanical failure ended the race early.',
  crash: 'Retired — a crash ended the race early.',
}

type DriverEntry = { id: string; name: string; code: string; teamId: string; flag?: string }
type TeamEntry   = { id: string; name: string; colorPrimary: string }
type Standing    = { driverId: string; points: number }
const allDrivers = driversData.drivers as DriverEntry[]
const allTeams   = (carsData as unknown as { teams: TeamEntry[] }).teams

function driverEntry(id: string): DriverEntry {
  return allDrivers.find(d => d.id === id) ?? { id, name: id, code: id.slice(0, 3).toUpperCase(), teamId: '' }
}
function teamColor(teamId: string): string {
  return allTeams.find(t => t.id === teamId)?.colorPrimary ?? '#888'
}
function teamName(teamId: string): string {
  return allTeams.find(t => t.id === teamId)?.name ?? ''
}

/** 1-based championship place; stable sort, so ties keep array order (as MainMenu). */
function placeOf(standings: readonly Standing[], driverId: string | null): number {
  const sorted = [...standings].sort((a, b) => b.points - a.points)
  const idx = sorted.findIndex(s => s.driverId === driverId)
  return idx >= 0 ? idx + 1 : sorted.length + 1
}

const label = { fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12, letterSpacing: '0.14em', color: 'var(--lilac-dim)' } as const
const numeric = { fontVariantNumeric: 'tabular-nums' as const }

function Confetti() {
  /*
   * The STORE, not matchMedia directly.
   *
   * Reading the media query here meant the in-app reduced-motion toggle did
   * NOT suppress the confetti -- two dozen simultaneously animating elements,
   * the heaviest motion moment in the game, ignoring the one setting a player
   * would reach for to stop it.
   *
   * The store now carries the OS preference as its default, so this is a
   * superset of the old behaviour rather than a replacement for it.
   */
  const reduced = useSettingsStore(s => s.reducedMotion)
  if (reduced) return null
  const COLORS = ['var(--volt)', 'var(--hot)', 'var(--gain)', 'var(--lilac)', 'var(--white)']
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 3 }}>
      {Array.from({ length: 24 }, (_, i) => (
        <motion.div
          key={i}
          initial={{ y: -12, x: `${8 + (i / 24) * 84}%`, opacity: 1 }}
          animate={{ y: '105vh', opacity: [1, 1, 0] }}
          transition={{ duration: 1.4 + (i % 5) * 0.15, delay: i * 0.045, ease: 'easeIn' }}
          style={{
            position: 'absolute', top: 0, width: 7, height: 7,
            borderRadius: 1, background: COLORS[i % COLORS.length],
          }}
        />
      ))}
    </div>
  )
}

export function RaceResult() {
  // MENU navigates. It does NOT abandon anything.
  //
  // This button called playAgain() before the career landed, which nulled
  // playerDriverId -- and the autosave clears the save whenever that is null.
  // So "MENU" silently destroyed the season a player had just raced. Career
  // made it worse (endCareer would take every season with it), which is how it
  // was noticed. backToMenu only changes phase, so the season save and the
  // career both survive and Continue still works.
  const { lastRaceResults, lastRaceEvents, standings: committedStandings, playerDriverId, raceIndex, nextRace, backToMenu, retryRace, resultPending, pendingBadges, pendingRace, currentCircuitId, lastSprintResults } = useSeasonStore()
  // The race is shown here but not yet counted -- it counts when the player
  // keeps it (NEXT RACE / FINAL STANDINGS). So the table and the badges show
  // what keeping it WOULD mean, from the same functions keepResult uses.
  const standings = resultPending && lastRaceResults
    ? addResultsToStandings(committedStandings, lastRaceResults)
    : committedStandings
  const previewBadges = resultPending ? pendingBadges() : []
  const uiTap = useUiTap()
  const reduced = useReducedMotion()
  const data = useMemo(() => loadGameData(), [])
  const [showFull, setShowFull] = useState(false)
  const job = useDebriefStore(s => s.job)
  const [sheet, setSheet] = useState(false)
  const makeRef = useRef<HTMLDivElement>(null)
  // Focus returns to MAKE A START when the sheet closes.
  const closeSheet = () => { setSheet(false); requestAnimationFrame(() => makeRef.current?.querySelector('button')?.focus()) }

  const playerResult = lastRaceResults?.find(r => r.driverId === playerDriverId)
  const seasonNumber = useCareerStore(s => s.seasonNumber)
  const sorted = [...(lastRaceResults ?? [])].sort((a, b) => a.position - b.position)
  const podium = sorted.filter(r => r.position <= 3 && !r.retired)
  const isTopThree = !playerResult?.retired && (playerResult?.position ?? 99) <= 3
  const headline = playerResult && lastRaceEvents
    ? (playerResult.retired
        ? RETIREMENT_HEADLINE[playerResult.retiredCause ?? 'tyre']
        : raceHeadline(playerResult.position, lastRaceEvents))
    : null
  const isSeasonEnd = raceIndex >= TOTAL_RACES - 1

  const circuitName = (data.circuits[currentCircuitId()]?.name ?? '').toUpperCase()
  const heroLabel = `${circuitName ? `${circuitName} · ` : ''}ROUND ${raceIndex + 1}${lastRaceEvents?.hadRain ? ' · WET' : ''}`
  const points = useCountUp(playerResult?.points ?? 0)
  const scored = (playerResult?.points ?? 0) > 0
  const retired = playerResult?.retired ?? false
  const heroInk = retired ? 'var(--white)' : 'var(--ink)'
  const positionText = !playerResult ? '—' : playerResult.retired ? 'DNF' : `P${playerResult.position}`

  // Grid is only known while the result is pending (pendingRace). A restored
  // legacy save has none, and a DNF has no finishing place to compare.
  const grid = resultPending ? pendingRace?.grid : undefined
  let gridLine: string | null = null
  if (grid !== undefined && playerResult && !playerResult.retired) {
    const gain = grid - playerResult.position
    gridLine = gain > 0 ? `From P${grid} on the grid ▲${gain}`
      : gain < 0 ? `From P${grid} on the grid ▼${-gain}`
      : `Held P${grid}`
  }

  // Championship after this race, and where it stood before it. `standings`
  // already includes this race in both the pending and the kept case, so the
  // "before" is the same table less this race's points.
  const racePoints = new Map((lastRaceResults ?? []).map(r => [r.driverId, r.points]))
  // A sprint round's sprint points were banked when the player left the sprint
  // result; they are already in `standings`. Shown beside each row as "S+N".
  const sprintPoints = new Map((lastSprintResults ?? []).map(r => [r.driverId, r.points]))
  const mySprint = playerDriverId ? sprintPoints.get(playerDriverId) ?? 0 : 0
  const before = standings.map(s => ({ driverId: s.driverId, points: s.points - (racePoints.get(s.driverId) ?? 0) }))
  const champPos = placeOf(standings, playerDriverId)
  const champPts = standings.find(s => s.driverId === playerDriverId)?.points ?? 0
  const prevPos = placeOf(before, playerDriverId)
  const champDelta = prevPos - champPos
  const deltaLine = champDelta > 0 ? `▲ Up ${champDelta} from P${prevPos}`
    : champDelta < 0 ? `▼ Down ${-champDelta} from P${prevPos}`
    : `= Held P${champPos}`
  const deltaColor = champDelta > 0 ? 'var(--gain)' : champDelta < 0 ? 'var(--hot)' : 'var(--lilac)'

  const badgeNames = previewBadges
    .map(id => BADGES.find(b => b.id === id)?.name)
    .filter((n): n is string => !!n)

  // Key moments
  const moments: { icon: string; text: string }[] = []
  if (lastRaceEvents) {
    if (lastRaceEvents.overtakesGained > 0)
      moments.push({ icon: '⚡', text: `${lastRaceEvents.overtakesGained} overtake${lastRaceEvents.overtakesGained > 1 ? 's' : ''}` })
    if (lastRaceEvents.pitsDone > 0)
      moments.push({ icon: '🔧', text: `${lastRaceEvents.pitsDone} pit stop${lastRaceEvents.pitsDone > 1 ? 's' : ''}` })
    if (lastRaceEvents.hadRain)
      moments.push({ icon: '🌧', text: 'Wet conditions' })
    if (playerResult && playerResult.points > 0)
      moments.push({ icon: '✦', text: `+${playerResult.points} pts` })
  }

  let step = 0
  const next = () => snapIn(reduced, step++)
  const podiumHeights = [156, 132, 120]

  return (
    <ScreenFrame label="Race result">
      {isTopThree && <Confetti />}
      <BadgeToast ids={previewBadges} />

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        {/* 1. Hero: the finish, on a volt band */}
        {/* The band is skewed -8deg: its top edge sits ~24px lower at the left
            text edge, its bottom ~20px higher at the right. Padding keeps every
            line of ink text on the volt (label below the left top edge,
            two-line summary above the right bottom edge). */}
        <div style={{ position: 'relative', overflow: 'hidden', minHeight: 286, padding: '44px 22px 24px' }}>
          {/* A retirement is not a celebration: the band drops volt for grape and the text goes white. */}
          <HeroBand color={retired ? 'var(--grape)' : 'var(--volt)'} height={250} top={12} />
          <div data-hero-text style={{ position: 'relative', color: heroInk, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <motion.div {...next()} style={{ ...label, color: heroInk }}>{heroLabel}</motion.div>
            <motion.div {...next()} style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 150, lineHeight: 0.85, ...numeric }}>
                {positionText}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 10, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 36, lineHeight: 1, ...numeric }}>
                  {scored
                    // Big Shoulders has no tabular figures: an invisible twin of the
                    // final value sizes the box, so the count-up never shifts PTS and
                    // "+" sits flush against the digits.
                    ? <><span style={{ display: 'inline-grid' }}>
                        <span aria-hidden="true" style={{ gridArea: '1 / 1', visibility: 'hidden' }}>+{playerResult?.points ?? 0}</span>
                        <span style={{ gridArea: '1 / 1', textAlign: 'right' }}>+{points}</span>
                      </span> PTS</>
                    : 'NO POINTS'}
                </span>
                {gridLine && (
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13 }}>{gridLine}</span>
                )}
              </span>
            </motion.div>
            {headline && (
              <motion.div {...next()} style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, lineHeight: 1.3, maxWidth: 320 }}>
                {headline}
              </motion.div>
            )}
          </div>
        </div>

        <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 2. Podium: P1 tallest, in the middle */}
          {podium.length === 3 && (
            <motion.div {...next()} style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }} aria-label="Podium" role="group">
              {([1, 0, 2] as const).map(idx => {
                const r = podium[idx]
                if (!r) return null
                const d = driverEntry(r.driverId)
                const livery = liveryOf(d.teamId)
                const isPlayer = r.driverId === playerDriverId
                return (
                  <div
                    key={r.driverId}
                    className="slant-md"
                    style={{
                      flex: 1, height: podiumHeights[r.position - 1] ?? 120,
                      background: isPlayer ? 'var(--dusk)' : 'var(--grape)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
                      gap: 4, padding: '10px 10px 12px', textAlign: 'center',
                    }}
                  >
                    <HelmetAvatar teamPrimary={livery.primary} teamSecondary={livery.accent} size={r.position === 1 ? 52 : 44} />
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 20, color: 'var(--white)', lineHeight: 1 }}>
                      {r.position} · {d.code}
                    </span>
                    {isPlayer
                      ? <span style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12, letterSpacing: '0.12em', color: 'var(--volt)' }}>YOU</span>
                      : <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12, color: 'var(--lilac)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{teamName(d.teamId)}</span>}
                  </div>
                )
              })}
            </motion.div>
          )}

          {/* 3. Championship + earned */}
          <motion.div {...next()} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: 'var(--night)', borderRadius: 14, padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={label}>CHAMPIONSHIP{resultPending ? ' · PROVISIONAL' : ''}</span>
              {standings.length > 0 ? (
                <>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 30, color: 'var(--white)', lineHeight: 1, ...numeric }}>
                    P{champPos} · <span>{champPts}</span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, color: deltaColor }}>{deltaLine}</span>
                  {mySprint > 0 && (
                    <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 12, color: 'var(--lilac)', ...numeric }}>
                      {`incl. S+${mySprint} from the sprint`}
                    </span>
                  )}
                </>
              ) : (
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--lilac)' }}>No standings yet</span>
              )}
            </div>
            <div style={{ background: 'var(--night)', borderRadius: 14, padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={label}>EARNED</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 30, color: 'var(--volt)', lineHeight: 1, ...numeric }}>
                +{data.upgrades.income.perRace} DP
              </span>
              {badgeNames.map(name => (
                <span key={name} style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, color: 'var(--white)' }}>{`★ ${name}`}</span>
              ))}
            </div>
          </motion.div>

          {/* 4. Lap chart, then the debrief verdicts (spec 1.5 §4) */}
          <LapChartCard />
          <DebriefCard />

          {/* 5. Key moments */}
          {moments.length > 0 && (
            <motion.div {...next()} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Key moments">
              {moments.map((m, i) => (
                <Pill key={i}><span aria-hidden="true">{m.icon}</span>{m.text}</Pill>
              ))}
            </motion.div>
          )}

          {/* 6. Full classification, behind a toggle */}
          <div>
            <button
              type="button"
              className="kit-focus"
              aria-expanded={showFull}
              aria-controls="race-result-classification"
              onClick={() => { uiTap(); setShowFull(o => !o) }}
              style={{
                width: '100%', minHeight: 48, background: 'transparent', color: 'var(--lilac)',
                border: '1px solid var(--dusk)', borderRadius: 12, cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 13, letterSpacing: '0.14em',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              FULL RESULTS <span aria-hidden="true">{showFull ? '▴' : '▾'}</span>
            </button>
            {showFull && (
              <div
                id="race-result-classification"
                role="region"
                aria-label="Classification"
                style={{ marginTop: 8, background: 'var(--night)', borderRadius: 12, overflow: 'hidden' }}
              >
                {sorted.map((r, i) => {
                  const d = driverEntry(r.driverId)
                  const color = teamColor(d.teamId)
                  const isPlayer = r.driverId === playerDriverId
                  return (
                    <motion.div
                      key={r.driverId}
                      initial={reduced ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: reduced ? 0 : 0.02 * i, ease: [0.2, 0, 0, 1] }}
                      style={{
                        display: 'grid', gridTemplateColumns: '30px 1fr auto',
                        alignItems: 'center', gap: 8, padding: '9px 12px',
                        background: isPlayer ? 'rgba(var(--volt-rgb),0.10)' : 'transparent',
                        borderLeft: isPlayer ? '3px solid var(--volt)' : '3px solid transparent',
                        borderBottom: i < sorted.length - 1 ? '1px solid var(--grape)' : 'none',
                      }}
                    >
                      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, color: r.retired ? 'var(--hot)' : 'var(--lilac-dim)', ...numeric }}>
                        {r.retired ? 'DNF' : r.position}
                      </span>
                      <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 16, fontWeight: 800, color: isPlayer ? 'var(--volt)' : 'var(--white)', opacity: r.retired ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {d.flag && <span style={{ fontSize: 11, fontStyle: 'normal' }}>{d.flag}</span>}
                        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                        {d.code}
                      </span>
                      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, color: r.points > 0 ? 'var(--gain)' : 'var(--lilac-dim)', textAlign: 'right', ...numeric }}>
                        {(sprintPoints.get(r.driverId) ?? 0) > 0
                          ? `+${r.points} · S+${sprintPoints.get(r.driverId)}`
                          : `+${r.points}`}
                      </span>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 7. Actions */}
      <div style={{ padding: '12px 16px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--ink)', position: 'relative', zIndex: 2 }}>
        {/* nextRace() already routes to the championship screen once raceIndex+1
            reaches TOTAL_RACES. This button used to be disabled precisely when
            isSeasonEnd, which made it the only caller of the only path to that
            screen — so the champion reveal was unreachable and a finished season
            just dead-ended here. */}
        <KitButton variant="primary" size="lg" style={{ width: '100%' }}
          onClick={() => { useDebriefStore.getState().cancel(); nextRace() }}>
          {isSeasonEnd ? 'FINAL STANDINGS →' : 'NEXT RACE →'}
        </KitButton>
        <div style={{ display: 'flex', gap: 10 }}>
          <KitButton variant="secondary" size="sm" style={{ flex: 1 }}
            onClick={() => { useDebriefStore.getState().cancel(); retryRace() }}>
            ↺ RETRY ROUND
          </KitButton>
          <ShareButton style={{ flex: 1 }} fileName={`pitwall-round-${raceIndex + 1}.png`} build={() => buildShareData({
            kind: 'gp', finish: playerResult && !playerResult.retired ? playerResult.position : null,
            circuitName, round: raceIndex + 1, season: seasonNumber, points: playerResult?.points ?? 0,
            podiumIds: podium.map(r => r.driverId), playerDriverId,
          })} />
          <KitButton variant="secondary" size="sm" style={{ flex: 1 }}
            onClick={() => { useDebriefStore.getState().cancel(); backToMenu() }}>
            MENU
          </KitButton>
        </div>
        {job?.recipe && (
          <div ref={makeRef}>
            <KitButton variant="secondary" size="sm" style={{ width: '100%' }} onClick={() => setSheet(true)}>MAKE A START</KitButton>
          </div>
        )}
      </div>
      {sheet && job?.recipe && <MakeStartSheet recipe={job.recipe} calls={job.calls} onClose={closeSheet} />}
    </ScreenFrame>
  )
}
