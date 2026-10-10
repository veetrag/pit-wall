import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { useClockStore } from '@state/clockStore'
import { useSettingsStore } from '@state/settingsStore'
import { soundService } from '@audio/soundService'
import { useHaptics, ImpactStyle } from '@hooks/useHaptics'

const NUM_LIGHTS = 5
const LIGHT_INTERVAL = 1000
const LIGHTS_OUT_DELAY = 600

function CircuitBackground() {
  return (
    <svg
      viewBox="0 0 390 844"
      xmlns="http://www.w3.org/2000/svg"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        {/* Deep night sky base */}
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0B0820" />
          <stop offset="100%" stopColor="#120E2B" />
        </linearGradient>

        {/* Floodlight halos */}
        <radialGradient id="fl1" cx="15%" cy="12%" r="45%">
          <stop offset="0%" stopColor="#fffbe6" stopOpacity="0.18" />
          <stop offset="60%" stopColor="#fffbe6" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#fffbe6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="fl2" cx="85%" cy="8%" r="40%">
          <stop offset="0%" stopColor="#fffbe6" stopOpacity="0.15" />
          <stop offset="60%" stopColor="#fffbe6" stopOpacity="0.03" />
          <stop offset="100%" stopColor="#fffbe6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="fl3" cx="50%" cy="55%" r="35%">
          <stop offset="0%" stopColor="#fffbe6" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#fffbe6" stopOpacity="0" />
        </radialGradient>

        {/* Track glow filter */}
        <filter id="trackglow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="softglow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="lampglow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <clipPath id="screen">
          <rect width="390" height="844" />
        </clipPath>
      </defs>

      <g clipPath="url(#screen)">
        {/* Sky */}
        <rect width="390" height="844" fill="url(#sky)" />

        {/* Floodlight atmospherics */}
        <rect width="390" height="844" fill="url(#fl1)" />
        <rect width="390" height="844" fill="url(#fl2)" />
        <rect width="390" height="844" fill="url(#fl3)" />

        {/* === CIRCUIT LAYOUT (stylised, not a real track) === */}
        {/* Outer track edge — thick white border */}
        <path
          d="
            M 195 790
            L 55 790 Q 20 790 20 755
            L 20 610 Q 20 575 50 558
            L 120 520 Q 160 500 165 468
            L 165 420 Q 165 390 140 372
            L 80 335 Q 40 315 40 275
            L 40 195 Q 40 155 75 140
            L 145 118 Q 175 108 185 80
            L 185 45 Q 185 20 210 20
            L 290 20 Q 330 20 345 50
            L 360 80 Q 370 110 345 130
            L 310 148 Q 280 162 278 195
            L 275 235 Q 272 268 300 285
            L 355 312 Q 375 325 375 360
            L 375 480 Q 375 510 350 522
            L 310 540 Q 280 555 275 582
            L 272 620 Q 270 655 300 672
            L 345 695 Q 370 710 370 745
            L 370 775 Q 370 800 345 808
            L 245 815 Q 215 815 195 800
            Z
          "
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="26"
          filter="url(#trackglow)"
        />

        {/* Track surface (dark asphalt fill) */}
        <path
          d="
            M 195 790
            L 55 790 Q 20 790 20 755
            L 20 610 Q 20 575 50 558
            L 120 520 Q 160 500 165 468
            L 165 420 Q 165 390 140 372
            L 80 335 Q 40 315 40 275
            L 40 195 Q 40 155 75 140
            L 145 118 Q 175 108 185 80
            L 185 45 Q 185 20 210 20
            L 290 20 Q 330 20 345 50
            L 360 80 Q 370 110 345 130
            L 310 148 Q 280 162 278 195
            L 275 235 Q 272 268 300 285
            L 355 312 Q 375 325 375 360
            L 375 480 Q 375 510 350 522
            L 310 540 Q 280 555 275 582
            L 272 620 Q 270 655 300 672
            L 345 695 Q 370 710 370 745
            L 370 775 Q 370 800 345 808
            L 245 815 Q 215 815 195 800
            Z
          "
          fill="none"
          stroke="rgba(30,38,60,0.9)"
          strokeWidth="22"
        />

        {/* Track centerline (teal glow) */}
        <path
          d="
            M 195 790
            L 55 790 Q 20 790 20 755
            L 20 610 Q 20 575 50 558
            L 120 520 Q 160 500 165 468
            L 165 420 Q 165 390 140 372
            L 80 335 Q 40 315 40 275
            L 40 195 Q 40 155 75 140
            L 145 118 Q 175 108 185 80
            L 185 45 Q 185 20 210 20
            L 290 20 Q 330 20 345 50
            L 360 80 Q 370 110 345 130
            L 310 148 Q 280 162 278 195
            L 275 235 Q 272 268 300 285
            L 355 312 Q 375 325 375 360
            L 375 480 Q 375 510 350 522
            L 310 540 Q 280 555 275 582
            L 272 620 Q 270 655 300 672
            L 345 695 Q 370 710 370 745
            L 370 775 Q 370 800 345 808
            L 245 815 Q 215 815 195 800
            Z
          "
          fill="none"
          style={{ stroke: 'rgba(var(--volt-rgb), 0.18)' }}
          strokeWidth="2"
          strokeDasharray="12 8"
          filter="url(#trackglow)"
        />

        {/* Pit lane (parallel to start/finish straight) */}
        <path
          d="M 195 810 L 195 840 Q 220 845 245 840 L 245 808"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="10"
        />
        <path
          d="M 195 810 L 195 840 Q 220 845 245 840 L 245 808"
          fill="none"
          style={{ stroke: 'rgba(var(--volt-rgb), 0.12)' }}
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        {/* Start / finish line */}
        <rect x="182" y="784" width="26" height="8" rx="1" fill="rgba(255,255,255,0)" />
        {[0,1,2,3].map(i => (
          <rect key={i} x={182 + i * 7} y={784} width={6} height={8}
            fill={i % 2 === 0 ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'} />
        ))}

        {/* Cars on the starting grid — 10 cars staggered */}
        {[0,1,2,3,4,5,6,7,8,9].map(i => {
          const side = i % 2 === 0 ? -14 : 6
          const yOff = i * 22
          const isPlayer = i === 0  // pole assumed player's car
          return (
            <g key={i} filter={isPlayer ? 'url(#softglow)' : undefined}>
              <rect
                x={195 + side}
                y={756 - yOff}
                width={14}
                height={22}
                rx={3}
                style={{ fill: isPlayer ? 'rgba(var(--volt-rgb), 0.75)' : 'rgba(160,180,220,0.22)' }}
              />
              {isPlayer && (
                <rect x={195 + side} y={756 - yOff} width={14} height={4} rx={2}
                  style={{ fill: 'var(--volt)' }} />
              )}
            </g>
          )
        })}

        {/* Floodlight poles — thin lines from edge to top */}
        {[
          [25, 50], [25, 200], [25, 380], [25, 580],
          [365, 30], [365, 160], [365, 340], [365, 500], [365, 700],
          [195, 22],
        ].map((pt, i) => { const x = pt[0]!; const y = pt[1]!; return (
          <g key={i}>
            <line x1={x} y1={y} x2={x} y2={y - 28}
              stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
            <circle cx={x} cy={y - 30} r={3}
              fill="#fffbe6" opacity="0.7" filter="url(#lampglow)" />
          </g>
        )})}

        {/* Subtle rubber line on track — along the racing line */}
        <path
          d="
            M 195 790
            L 100 790 Q 50 790 38 755
            L 38 615 Q 38 582 68 566
            L 138 528 Q 168 510 170 480
            L 170 430
          "
          fill="none"
          stroke="rgba(80,70,50,0.25)"
          strokeWidth="8"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}

export function StartLights() {
  const confirmRaceStart = useRaceStore(s => s.confirmRaceStart)
  const setSpeed = useClockStore(s => s.setSpeed)
  /*
   * The player's "Default playback speed" setting. It was persisted and
   * rendered but NOTHING consumed it: both lights-out paths below hardcoded
   * setSpeed(1), so every race started at 1x no matter what the player chose.
   * Found by setting it to 4x on a device and watching the race start at 1x.
   */
  const simSpeed = useSettingsStore(s => s.simSpeed)
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const { impact } = useHaptics()
  const config = useRaceStore(s => s.config)
  const [litCount, setLitCount] = useState(0)
  const [lightsOut, setLightsOut] = useState(false)
  const [showGo, setShowGo] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (reducedMotion) {
      soundService.play('lightsOut')
      confirmRaceStart()
      setSpeed(simSpeed)
      return
    }

    const timers: ReturnType<typeof setTimeout>[] = []

    for (let i = 1; i <= NUM_LIGHTS; i++) {
      timers.push(setTimeout(() => {
        setLitCount(i)
        soundService.play('tick')
        impact(ImpactStyle.Light)
      }, i * LIGHT_INTERVAL))
    }

    const totalLightTime = NUM_LIGHTS * LIGHT_INTERVAL + LIGHTS_OUT_DELAY
    timers.push(setTimeout(() => {
      setLightsOut(true)
      setShowGo(true)
      soundService.play('lightsOut')
      impact(ImpactStyle.Heavy)
    }, totalLightTime))

    timers.push(setTimeout(() => {
      confirmRaceStart()
      setSpeed(simSpeed)
      setDone(true)
    }, totalLightTime + 800))

    return () => timers.forEach(clearTimeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (done) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 200, gap: 32, overflow: 'hidden',
      }}
    >
      {/* Night circuit background */}
      <CircuitBackground />

      {/* Dark vignette overlay so UI pops */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 45%, rgba(10,14,26,0.3) 0%, rgba(10,14,26,0.75) 100%)',
        pointerEvents: 'none',
      }} />

      {/* Race day label */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        style={{
          position: 'relative',
          fontFamily: 'var(--font-display)', fontSize: 11,
          color: 'var(--text-dim)', letterSpacing: '0.25em',
        }}
      >
        RACE DAY — LIGHTS SEQUENCE
      </motion.div>

      {/* Lights gantry */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: -16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        style={{ position: 'relative' }}
      >
        {/* Gantry bar */}
        <div style={{
          position: 'absolute', top: -8, left: -12, right: -12, height: 4,
          background: 'rgba(255,255,255,0.08)', borderRadius: 2,
        }} />

        <div style={{
          background: 'rgba(10,14,26,0.85)',
          backdropFilter: 'blur(8px)',
          borderRadius: 14,
          padding: '20px 28px',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', gap: 18, alignItems: 'center',
          boxShadow: '0 8px 48px rgba(0,0,0,0.6)',
        }}>
          {Array.from({ length: NUM_LIGHTS }, (_, i) => {
            const lit = !lightsOut && litCount > i
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                {/* Housing */}
                <div style={{
                  width: 10, height: 10,
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.1)',
                }} />
                <motion.div
                  animate={lit
                    ? { scale: [1, 1.18, 1], boxShadow: ['0 0 0px #FF4D5E', '0 0 32px #FF4D5E', '0 0 20px #FF4D5E'] }
                    : lightsOut
                      ? { scale: 0.85, opacity: 0.15 }
                      : {}
                  }
                  transition={{ duration: 0.3 }}
                  style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: lit ? '#FF4D5E' : 'rgba(40,20,20,0.8)',
                    border: lit ? '2px solid rgba(255,150,150,0.4)' : '2px solid rgba(60,30,30,0.5)',
                    boxShadow: lit ? '0 0 20px #FF4D5E, inset 0 0 10px rgba(255,200,200,0.3)' : 'none',
                    transition: 'background 0.15s, border 0.15s',
                  }}
                />
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* GO / status text */}
      <div style={{ position: 'relative', height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AnimatePresence mode="wait">
          {showGo ? (
            <motion.div
              key="go"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              style={{
                fontFamily: 'var(--font-display)', fontSize: 72, fontWeight: 800,
                color: 'var(--positive)', letterSpacing: '0.1em',
                textShadow: '0 0 60px var(--positive), 0 0 20px var(--positive)',
              }}
            >
              GO
            </motion.div>
          ) : (
            <motion.div
              key="status"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-dim)',
                letterSpacing: '0.15em', textAlign: 'center',
              }}
            >
              {litCount === 0
                ? 'FORMATION LAP COMPLETE'
                : litCount < NUM_LIGHTS
                  ? `LIGHT ${litCount} OF ${NUM_LIGHTS}`
                  : 'LIGHTS OUT IMMINENT…'
              }
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom circuit name */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 0.5 }}
        style={{
          // Sits above the system nav bar — at a flat 40px it was clipped on a
          // device with on-screen navigation.
          position: 'absolute', bottom: 'calc(40px + var(--safe-bottom))',
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--text-dim)', letterSpacing: '0.2em',
          textAlign: 'center', padding: '0 16px',
        }}
      >
        {config ? `${config.circuit.name.toUpperCase()} · LAP 1 OF ${config.circuit.laps}` : ''}
      </motion.div>
    </motion.div>
  )
}
