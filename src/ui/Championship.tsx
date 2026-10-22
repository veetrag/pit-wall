import { useEffect, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { ScreenFrame, ScreenHeader, HeroBand, Tabs, StandingRow, StatTile, ProgressStrip, KitButton, Pill, snapIn } from '@ui/kit'
import { HelmetAvatar } from './HelmetAvatar'
import { useSeasonStore, TOTAL_RACES } from '@state/seasonStore'
import { useCareerStore, erodeTiers } from '@state/careerStore'
import { useSettingsStore } from '@state/settingsStore'
import { BadgeToast } from './BadgeToast'
import { ShareButton } from './share/ShareButton'
import { buildShareData } from './share/shareCard'
import { OfferCard } from './OfferCard'
import { LadderReveal, ConstructorsList } from './LadderReveal'
import { useUiTap } from '@hooks/useUiTap'
import { useShortViewport } from '@hooks/useShortViewport'
import { pushCloudSave } from '@sync/storeBridge'
import { maybeAskForReview } from '@sync/platformBridge'
import { loadGameData } from '@data/validators'
import driversData from '@data/drivers.json'

type DriverEntry = { id: string; name: string; teamId: string }
const drivers = driversData.drivers as DriverEntry[]
const TEAM_COLOR = new Map(loadGameData().cars.teams.map(t => [t.id, t.colorPrimary] as [string, string]))

function driverName(id: string): string {
  return drivers.find(d => d.id === id)?.name ?? id.replace('d_', '').toUpperCase()
}
/** A driver's team colour, from data; dusk for an id the data does not know. */
function driverColor(id: string): string {
  const teamId = drivers.find(d => d.id === id)?.teamId
  return (teamId && TEAM_COLOR.get(teamId)) || 'var(--dusk)'
}

/** Drivers shown before the ALL {n} DRIVERS fold. */
const FOLD = 10
const sectionLabel: CSSProperties = { fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12, letterSpacing: 2 }

export function Championship() {
  const { standings, playerDriverId, purchasedTiers, lastSeasonBonus, startNextSeason, endCareer, lastLadder, selectedTeamId, toNewTeamDriver, declineOffer } = useSeasonStore()
  const seasonNumber = useCareerStore(s => s.seasonNumber)
  const offer = useCareerStore(s => s.pendingOffer ?? null)
  const [choice, setChoice] = useState<'stay' | 'accept'>('stay')
  const live = offer !== null && offer.season === seasonNumber
  const accepting = live && choice === 'accept'
  const offerName = live ? (loadGameData().cars.teams.find(t => t.id === offer!.teamId)?.name ?? '').toUpperCase() : ''
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const uiTap = useUiTap()
  const [confirmingEnd, setConfirmingEnd] = useState(false)
  const [table, setTable] = useState<'drivers' | 'teams'>('drivers')
  const [showAll, setShowAll] = useState(false)
  const short = useShortViewport()

  const { tierCosts, attributes } = loadGameData().upgrades
  /*
   * The cloud save points, both of them, and they are here rather than in the
   * store on purpose: seasonStore must not import sync/, or every test that
   * touches a season drags a native plugin in behind it.
   *
   * On mount, because reaching this screen is the moment recordSeasonEnd
   * banked a title -- the single most painful thing in the game to lose.
   * Again after NEXT SEASON, because rollOverSeason erodes tiers and advances
   * the season, and a crash between the two would leave the cloud a season
   * behind. Both are fire-and-forget; a failed write is never the player's
   * problem.
   */
  useEffect(() => { pushCloudSave() }, [])


  const { tierDecayPerSeason, tierDecayFloor } = loadGameData().tuning.career
  const maxTiers = attributes.length * tierCosts.length
  // Must pass the floor. This is a PREVIEW of what rollOverSeason will do, so
  // an argument list that drifts from that call site makes the screen promise
  // one number and the winter deliver another.
  const erodedTiers = erodeTiers(purchasedTiers, tierDecayPerSeason, tierDecayFloor)
  const keptTiers = Object.values(erodedTiers).reduce((sum, n) => sum + n, 0)

  const winner = standings[0]
  const playerStanding = standings.find(s => s.driverId === playerDriverId)
  const playerRank = standings.findIndex(s => s.driverId === playerDriverId) + 1
  /*
   * The review prompt, at the only moment in the game a player is reliably
   * pleased: the screen that tells them they won the championship. The policy
   * itself lives in reviewPolicy.ts and refuses everything else -- a loss, a
   * retirement, a launch. Asking at the wrong moment turns a good race into a
   * one-star review, which is worse than never asking.
   */
  useEffect(() => {
    if (playerRank === 1) void maybeAskForReview(playerRank)
  }, [playerRank])

  const playerWon = winner !== undefined && winner.driverId === playerDriverId
  const leaderPts = winner?.points ?? 0
  const shownDrivers = showAll ? standings : standings.slice(0, FOLD)

  // One element, placed by viewport: the footer on a tall phone, the end of
  // the scrolling content on a short one. Either way it must be confirmed.
  const endCareerControls = !confirmingEnd ? (
    <KitButton variant="secondary" size="sm" onClick={() => setConfirmingEnd(true)} style={{ width: '100%' }}>
      END CAREER
    </KitButton>
  ) : (
    <motion.div {...snapIn(reducedMotion)} style={{ display: 'flex', gap: 8 }}>
      <KitButton variant="secondary" size="sm" onClick={() => setConfirmingEnd(false)} style={{ flex: 1 }}>
        CANCEL
      </KitButton>
      <KitButton variant="urgent" size="sm" onClick={() => endCareer()} style={{ flex: 2 }}>
        CONFIRM — END CAREER
      </KitButton>
    </motion.div>
  )

  return (
    <ScreenFrame label="Championship">
      {/*
        The season was banked by careerStore.recordSeasonEnd on the transition
        into this phase, so by the time this renders the career record already
        holds the title -- which is what lets Champion and Dynasty be announced
        here, on the screen that celebrates the season, rather than on the
        upgrades screen afterwards.
      */}
      {/*
        The content area: the scrolling season story, then the badge toast IN
        FLOW beneath it. The toast does not time out here, and as an overlay it
        covered NEXT SEASON (and, scrolled down, END CAREER) for as long as the
        player stayed. In flow it takes its height from the scroll area instead.
      */}
      <div data-testid="season-content" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 16 }}>
        <div>
          <ScreenHeader eyebrow={`SEASON ${seasonNumber} · FINAL`} title="Championship" />
          <div style={{ padding: '10px 16px 0' }}>
            <ProgressStrip total={TOTAL_RACES} done={TOTAL_RACES} ariaLabel="Season complete" />
          </div>
        </div>

        {/* 1. The verdict: the ladder's one orchestrated moment */}
        {lastLadder && selectedTeamId && (
          <LadderReveal moves={lastLadder} playerTeamId={selectedTeamId} />
        )}

        {lastLadder && selectedTeamId && (() => {
          const me = lastLadder.find(m => m.teamId === selectedTeamId)
          return me ? (
            <div style={{ margin: '0 16px' }}>
              <Pill ariaLabel={`Board target: P${me.deserved} in the constructors' championship, finished P${me.finished}`}>
                BOARD TARGET · P{me.deserved} IN THE CONSTRUCTORS' · FINISHED P{me.finished}
              </Pill>
            </div>
          ) : null
        })()}
        {live && <OfferCard offer={offer!} choice={choice} onChoice={setChoice} />}

        {/* 2. The champion, on their team's colour (ink text: every
            colorPrimary clears 4.5:1 against ink) */}
        {winner && (
          <motion.div {...snapIn(reducedMotion, 1)}>
            <div style={{ position: 'relative', overflow: 'hidden', minHeight: 186, padding: '40px 22px 30px', boxSizing: 'border-box' }}>
              <HeroBand color={driverColor(winner.driverId)} height={150} top={18} />
              <div style={{ position: 'relative', color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 14 }}>
                <HelmetAvatar teamPrimary="var(--ink)" teamSecondary="var(--white)" size={72} />
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={sectionLabel}>{playerWon ? 'YOU ARE THE CHAMPION' : 'CHAMPION'}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 38, lineHeight: 0.95, textTransform: 'uppercase', overflowWrap: 'anywhere' }}>
                    {driverName(winner.driverId)}
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 15 }}>{winner.points} pts</span>
                </div>
              </div>
            </div>
            {playerDriverId && !playerWon && playerStanding && (
              <div style={{ margin: '0 16px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                <StatTile value={`P${playerRank}`} label="YOU FINISHED" />
                <StatTile value={playerStanding.points} label="PTS" />
              </div>
            )}
          </motion.div>
        )}

        {playerDriverId && (
          <div style={{ margin: '0 16px' }}>
            <ShareButton fileName={`pitwall-season-${seasonNumber}.png`} build={() => buildShareData({
              kind: 'season', finish: playerRank > 0 ? playerRank : null, season: seasonNumber,
              points: playerStanding?.points ?? 0, podiumIds: standings.slice(0, 3).map(s => s.driverId), playerDriverId,
            })} />
          </div>
        )}

        {/* 3. Standings */}
        <div style={{ margin: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Tabs ariaLabel="Standings" value={table} onChange={v => setTable(v)}
            tabs={[{ value: 'drivers', label: 'DRIVERS' }, { value: 'teams', label: 'TEAMS' }]} />
          {table === 'teams' && selectedTeamId && (
            <ConstructorsList standings={standings} playerTeamId={selectedTeamId} />
          )}
          {table === 'drivers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {shownDrivers.map((s, i) => (
                <motion.div key={s.driverId} {...snapIn(reducedMotion, Math.min(i, FOLD))}>
                  <StandingRow pos={i + 1} teamColor={driverColor(s.driverId)} name={driverName(s.driverId)}
                    value={s.points} bar={leaderPts > 0 ? s.points / leaderPts : 0} mine={s.driverId === playerDriverId} />
                </motion.div>
              ))}
              {standings.length > FOLD && (
                <button type="button" className="kit-focus" aria-expanded={showAll}
                  onClick={() => { uiTap(); setShowAll(v => !v) }}
                  style={{ minHeight: 48, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--lilac)',
                    fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 13 }}>
                  {showAll ? 'TOP 10 ↑' : `ALL ${standings.length} DRIVERS ↓`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* On a short phone END CAREER lives at the end of the content: it is
            rare and destructive, and pinned it cost the footer ~60px. */}
        {short && <div style={{ margin: '0 16px' }}>{endCareerControls}</div>}
      </div>
      <BadgeToast placement="inline" />
      </div>

      {/* Season boundary. Compact on a short phone (1.4 phone pass: ~260px of
          footer at 360x640). */}
      <div data-testid="season-footer" style={{ padding: short ? '8px 16px 10px' : '12px 16px 16px', borderTop: '1px solid var(--line-hair)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: short ? 6 : 10 }}>
        {/*
          The podium bonus. Shown only when it was paid -- a "+0 POINTS" row
          for a midfield season would read as a taunt, and an absent row says
          the same thing without the sneer.
        */}
        {lastSeasonBonus > 0 && (
          <motion.div {...snapIn(reducedMotion, 2)} style={{ display: 'flex', justifyContent: 'center' }}>
            <Pill tone="volt">CHAMPIONSHIP BONUS +{lastSeasonBonus} PTS</Pill>
          </motion.div>
        )}
        <KitButton variant="primary" size="lg" ariaLabel={accepting ? `Sign for ${offerName}` : 'Next season'}
          onClick={() => { if (accepting) { toNewTeamDriver(); return } declineOffer(); startNextSeason(); pushCloudSave() }}
          style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: short ? '6px 22px' : '8px 22px' }}>
          <span style={{ lineHeight: short ? 1.05 : undefined }}>{accepting ? `SIGN FOR ${offerName} →` : 'NEXT SEASON →'}</span>
          <span style={{ fontFamily: 'var(--font-body)', fontStyle: 'normal', fontWeight: 700, fontSize: short ? 11 : 12, textTransform: 'none', letterSpacing: 0, lineHeight: short ? 1.2 : 1.3 }}>
            {accepting
              ? `Season ${seasonNumber + 1} · Upgrade tiers start from 0 · Dev points carry over`
              : `Season ${seasonNumber + 1} · You keep ${keptTiers} of ${maxTiers} upgrade tiers · Rivals developed over the winter`}
          </span>
        </KitButton>

        {!short && endCareerControls}
      </div>
    </ScreenFrame>
  )
}
