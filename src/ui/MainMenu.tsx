import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import { CIRCUIT_ORDER } from '@state/raceStore'
import { loadSnapshot, type SeasonSnapshot } from '@state/seasonPersistence'
import { loadCareer } from '@state/careerPersistence'
import { useCareerStore } from '@state/careerStore'
import { loadGameData } from '@data/validators'
import { KitButton, Pill, ProgressStrip, HeroBand, CarArt, liveryOf, snapIn, useReducedMotion, ScreenFrame } from '@ui/kit'

const SETTINGS_BTN: CSSProperties = {
  width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer',
  background: 'var(--grape)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
}

function GearIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--white)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </svg>
  )
}

function SubLabel({ children }: { children: string }) {
  return (
    <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontStyle: 'normal', fontWeight: 700, fontSize: 12, letterSpacing: 1, opacity: 0.75, marginTop: 2 }}>
      {children}
    </span>
  )
}

export function MainMenu() {
  const startNewSeason = useSeasonStore(s => s.startNewSeason)
  const resumeSeason = useSeasonStore(s => s.resumeSeason)
  const viewGrid = useSeasonStore(s => s.viewGrid)
  const viewCareer = useSeasonStore(s => s.viewCareer)
  const viewHowToPlay = useSeasonStore(s => s.viewHowToPlay)
  const viewSettings = useSeasonStore(s => s.viewSettings)
  const viewScenarios = useSeasonStore(s => s.viewScenarios)
  const resumeCareer = useCareerStore(s => s.resumeCareer)
  const hasCareer = useCareerStore(s => s.hasCareer)
  const seasonNumber = useCareerStore(s => s.seasonNumber)
  const reduced = useReducedMotion()

  // Read on mount rather than at app start: the menu is remounted every time
  // the player comes back to it, so a season abandoned during this run stops
  // being offered without any invalidation plumbing.
  const [saved, setSaved] = useState<SeasonSnapshot | null>(null)
  useEffect(() => {
    let live = true
    void loadSnapshot().then(s => { if (live) setSaved(s) })
    void loadCareer().then(c => { if (live && c) resumeCareer(c) })
    return () => { live = false }
  }, [])

  // Starting a new season CLEARS the saved one (startNewSeason nulls
  // playerDriverId, which is the autosave's signal to delete). So when a save
  // exists, the button asks once rather than destroying a championship on a
  // mis-tap. Inline rather than a modal -- one tap to arm, one to confirm.
  const [confirmNew, setConfirmNew] = useState(false)

  function onNewSeason() {
    if (saved && !confirmNew) { setConfirmNew(true); return }
    startNewSeason()
  }

  const data = useMemo(() => loadGameData(), [])
  const teamId = saved?.selectedTeamId ?? null
  const team = teamId ? data.cars.teams.find(t => t.id === teamId) : undefined
  const livery = liveryOf(teamId ?? 'apex')
  // Car on a team-coloured band: ink body with coloured accents (matches the canvas).
  const INK = '#120E2B'
  const carAccent = !saved || livery.accent.toLowerCase() === livery.primary.toLowerCase() || livery.accent.toLowerCase() === INK.toLowerCase()
    ? '#FFFFFF' : livery.accent
  const calendarId = saved ? CIRCUIT_ORDER[saved.raceIndex % CIRCUIT_ORDER.length] : undefined
  const circuitName = saved
    ? (saved.selectedCircuitId ? data.circuits[saved.selectedCircuitId]?.name : undefined)
      ?? (calendarId ? data.circuits[calendarId]?.name : undefined) ?? ''
    : ''
  const total = CIRCUIT_ORDER.length

  let standing = 0
  let points = 0
  if (saved) {
    const sorted = [...saved.standings].sort((a, b) => b.points - a.points) // stable: ties keep array order
    const idx = sorted.findIndex(s => s.driverId === saved.playerDriverId)
    standing = idx >= 0 ? idx + 1 : sorted.length + 1
    points = idx >= 0 ? sorted[idx]!.points : 0
  }

  let i = 0
  const next = () => snapIn(reduced, i++)

  return (
    <ScreenFrame label="Main menu" style={{ overflowY: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 20px 12px', flex: 1 }}>
        {/* Header */}
        <motion.div {...next()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {saved
            ? <Pill>{team?.name ?? 'Your team'}{seasonNumber ? ` · Season ${seasonNumber}` : ''}</Pill>
            : (
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 34, color: 'var(--white)', lineHeight: 1 }}>
                PIT WALL
              </span>
            )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {saved && <Pill tone="volt">{saved.devPoints} DP</Pill>}
            <button type="button" aria-label="Settings" className="kit-focus" style={SETTINGS_BTN} onClick={viewSettings}>
              <GearIcon />
            </button>
          </div>
        </motion.div>

        {/* Hero */}
        <motion.div {...next()} style={{ position: 'relative', height: 262, margin: '0 -20px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <HeroBand color={saved ? livery.primary : 'var(--volt)'} height={290} top={-40} />
          <div style={{ position: 'relative', width: 300, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CarArt primary={saved ? INK : livery.primary} accent={saved ? carAccent : livery.accent} height={300} heading="left"
              label={`${team?.name ?? 'Apex Racing'} car`} />
          </div>
        </motion.div>

        {/* Next race card */}
        {saved && (
          <motion.div {...next()} className="slant-lg" style={{ background: 'var(--grape)', padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12, letterSpacing: 1.5, color: 'var(--lilac)' }}>
              ROUND {saved.raceIndex + 1} OF {total}
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 44, lineHeight: 1, textTransform: 'uppercase', color: 'var(--white)' }}>
              {circuitName}
            </span>
            <ProgressStrip total={total} done={saved.raceIndex} />
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: 'var(--lilac)', fontVariantNumeric: 'tabular-nums' }}>
              P{standing} · {points} pts
            </span>
          </motion.div>
        )}

        {/* Primary */}
        <motion.div {...next()}>
          {saved
            ? (
              <KitButton variant="primary" size="lg" style={{ width: '100%' }} onClick={() => resumeSeason(saved)}>
                <span>CONTINUE SEASON</span>
                <SubLabel>{`Round ${saved.raceIndex + 1} of ${total}`}</SubLabel>
              </KitButton>
            )
            : (
              <KitButton variant="primary" size="lg" style={{ width: '100%' }} onClick={startNewSeason}>
                <span>NEW SEASON</span>
                <SubLabel>{`${total}-race championship`}</SubLabel>
              </KitButton>
            )}
        </motion.div>

        {/* Tiles */}
        <motion.div {...next()} style={{ display: 'flex', gap: 10 }}>
          <KitButton variant="secondary" size="sm" style={{ flex: 1, padding: '0 12px' }} onClick={viewScenarios}>SCENARIOS</KitButton>
          <KitButton variant="secondary" size="sm" style={{ flex: 1, padding: '0 12px' }} onClick={viewGrid}>GARAGE</KitButton>
          {hasCareer && <KitButton variant="secondary" size="sm" style={{ flex: 1, padding: '0 12px' }} onClick={viewCareer}>CAREER</KitButton>}
        </motion.div>

        {/* Secondary */}
        <motion.div {...next()} style={{ display: 'flex', gap: 10 }}>
          {saved && (
            <KitButton variant="secondary" size="sm" display={false} style={{ flex: 1, padding: '0 12px' }} onClick={onNewSeason}>
              {confirmNew
                ? <span>DISCARD AND START OVER?<SubLabel>Tap again to confirm</SubLabel></span>
                : 'NEW SEASON'}
            </KitButton>
          )}
          <KitButton variant="secondary" size="sm" display={false} style={{ flex: 1, padding: '0 12px' }} onClick={viewHowToPlay}>HOW TO PLAY</KitButton>
        </motion.div>
      </div>

      <motion.div {...next()} style={{ textAlign: 'center', paddingBottom: 16, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--lilac-dim)' }}>
        PIT WALL · v{__APP_VERSION__}
      </motion.div>
    </ScreenFrame>
  )
}
