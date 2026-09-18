import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import { CIRCUIT_ORDER } from '@state/raceStore'
import { loadSnapshot, type SeasonSnapshot } from '@state/seasonPersistence'
import { useUiTap } from '@hooks/useUiTap'

function AmbientHero() {
  return (
    <div style={{ position: 'relative', width: '100%', height: 160, marginBottom: 8, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 80% 60% at 50% 80%, rgba(0,229,208,0.07) 0%, transparent 70%)',
      }} />
      <svg viewBox="0 0 320 150" style={{ width: '100%', height: '100%' }} aria-hidden>
        {/* Outer track loop */}
        <path
          d="M 48,115 Q 28,115 28,95 L 28,55 Q 28,38 48,38 L 128,38 Q 138,38 143,47 L 153,62 Q 160,72 160,72 Q 160,72 167,62 L 177,47 Q 182,38 192,38 L 272,38 Q 292,38 292,55 L 292,95 Q 292,115 272,115 Z"
          fill="none" stroke="rgba(0,229,208,0.18)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
        />
        {/* Inner outline */}
        <path
          d="M 68,100 Q 52,100 52,84 L 52,66 Q 52,52 68,52 L 118,52 Q 126,52 130,60 L 140,75 Q 148,88 160,88 Q 172,88 180,75 L 190,60 Q 194,52 202,52 L 252,52 Q 268,52 268,66 L 268,84 Q 268,100 252,100 Z"
          fill="none" stroke="rgba(0,229,208,0.06)" strokeWidth="3"
        />
        {/* Start/finish tick */}
        <line x1="52" y1="100" x2="52" y2="112" stroke="rgba(0,229,208,0.5)" strokeWidth="2" strokeDasharray="3 2" />
        {/* Floodlight glow dots */}
        <circle cx="28" cy="32" r="3.5" fill="rgba(242,201,76,0.2)" />
        <circle cx="292" cy="32" r="3.5" fill="rgba(242,201,76,0.2)" />
        <circle cx="160" cy="20" r="3" fill="rgba(242,201,76,0.15)" />
      </svg>
      {/* Sweep glow */}
      <motion.div
        animate={{ x: ['-25%', '125%'] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'linear', repeatDelay: 5 }}
        style={{
          position: 'absolute', top: 0, bottom: 0, width: '28%',
          background: 'linear-gradient(90deg, transparent, rgba(0,229,208,0.05), transparent)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

interface MenuItem { id: string; label: string; sub: string; primary: boolean }

const BROWSE_ITEMS: MenuItem[] = [
  { id: 'scenarios', label: 'SCENARIOS',     sub: 'Drop into a race in progress', primary: false },
  { id: 'grid',     label: 'GRID & GARAGE',  sub: 'Browse drivers & teams',     primary: false },
  { id: 'howto',    label: 'HOW TO PLAY',    sub: 'Strategy primer',            primary: false },
  { id: 'settings', label: 'SETTINGS',       sub: 'Sound, haptics, gameplay',   primary: false },
]

const NEW_SEASON: MenuItem =
  { id: 'race', label: 'NEW SEASON', sub: '12-race championship', primary: true }

export function MainMenu() {
  const startNewSeason = useSeasonStore(s => s.startNewSeason)
  const resumeSeason = useSeasonStore(s => s.resumeSeason)
  const viewGrid = useSeasonStore(s => s.viewGrid)
  const viewHowToPlay = useSeasonStore(s => s.viewHowToPlay)
  const viewSettings = useSeasonStore(s => s.viewSettings)
  const viewScenarios = useSeasonStore(s => s.viewScenarios)
  const uiTap = useUiTap()

  // Read on mount rather than at app start: the menu is remounted every time
  // the player comes back to it, so a season abandoned during this run stops
  // being offered without any invalidation plumbing.
  const [saved, setSaved] = useState<SeasonSnapshot | null>(null)
  useEffect(() => {
    let live = true
    void loadSnapshot().then(s => { if (live) setSaved(s) })
    return () => { live = false }
  }, [])

  // Starting a new season CLEARS the saved one (startNewSeason nulls
  // playerDriverId, which is the autosave's signal to delete). So when a save
  // exists, the button asks once rather than destroying a championship on a
  // mis-tap. Inline rather than a modal -- one tap to arm, one to confirm.
  const [confirmNew, setConfirmNew] = useState(false)

  const items: MenuItem[] = saved
    ? [
        { id: 'continue', label: 'CONTINUE SEASON',
          sub: `Round ${saved.raceIndex + 1} of ${CIRCUIT_ORDER.length}`, primary: true },
        confirmNew
          ? { id: 'race', label: 'DISCARD AND START OVER?', sub: 'Tap again to confirm', primary: false }
          : { ...NEW_SEASON, primary: false },
        ...BROWSE_ITEMS,
      ]
    : [NEW_SEASON, ...BROWSE_ITEMS]

  function handleAction(id: string) {
    uiTap()
    if (id === 'continue') { if (saved) resumeSeason(saved) }
    else if (id === 'race') {
      if (saved && !confirmNew) { setConfirmNew(true); return }
      startNewSeason()
    }
    else if (id === 'grid') viewGrid()
    else if (id === 'howto') viewHowToPlay()
    else if (id === 'settings') viewSettings()
    else if (id === 'scenarios') viewScenarios()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-deep)',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Subtle grid lines background */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.025, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(var(--text-hi) 1px,transparent 1px),linear-gradient(90deg,var(--text-hi) 1px,transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 28px' }}>
        {/* Hero */}
        <AmbientHero />

        {/* Wordmark */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.32em', marginBottom: 6 }}
          >
            RACE STRATEGY
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
            style={{
              fontFamily: 'var(--font-display)', fontSize: 50, fontWeight: 800,
              color: 'var(--text-hi)', letterSpacing: '-0.02em', lineHeight: 1,
              textShadow: '0 0 60px rgba(0,229,208,0.2)',
            }}
          >
            PIT WALL
          </motion.div>
        </div>

        {/* Nav buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 300, width: '100%', alignSelf: 'center' }}>
          {items.map(({ id, label, sub, primary }, i) => (
            <motion.button
              key={id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.07 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleAction(id)}
              style={{
                background: primary ? 'var(--accent)' : 'transparent',
                color: primary ? 'var(--bg-deep)' : 'var(--text-mid)',
                border: primary ? 'none' : '1px solid var(--line-hair)',
                borderRadius: 12, padding: primary ? '17px 0' : '13px 0',
                fontFamily: 'var(--font-display)', fontWeight: primary ? 700 : 600,
                fontSize: primary ? 16 : 13, letterSpacing: '0.09em', cursor: 'pointer',
                width: '100%', textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              }}
            >
              <span>{label}</span>
              {/*
                Rendered for the PRIMARY button too, which it was not before.
                CONTINUE SEASON is primary and its sub-label carries the round
                the player is on -- the single most useful thing on this screen
                for a returning player -- so hiding it on primary items made
                that text exist in code and never reach the screen.
                rgba(0,0,0,0.6) on the accent fill measures 4.94:1, clearing AA;
                --text-dim would be illegible there.
              */}
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: primary ? 'rgba(0,0,0,0.6)' : 'var(--text-dim)',
                letterSpacing: '0.05em', fontWeight: 400,
              }}>
                {sub}
              </span>
            </motion.button>
          ))}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
        style={{ textAlign: 'center', paddingBottom: 16, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em' }}
      >
        PIT WALL · v1.0
      </motion.div>
    </motion.div>
  )
}
