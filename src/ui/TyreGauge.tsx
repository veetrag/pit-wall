import { useRaceStore } from '@state/raceStore'
import { tyreCliffFraction } from '@engine/index'

function cliffColor(fraction: number): string {
  if (fraction >= 1.0) return 'var(--accent-warm)'
  if (fraction >= 0.7) return 'var(--tyre-medium)'
  return 'var(--accent)'
}

const COMPOUND_LABEL: Record<string, string> = { S: 'SOFT', M: 'MED', H: 'HARD' }

export function TyreGauge() {
  const raceState = useRaceStore(s => s.raceState)
  const config = useRaceStore(s => s.config)

  if (!raceState || !config) return null

  const player = raceState.cars.find(c => c.isPlayer)
  if (!player) return null

  const spec = config.compounds[player.compound]!
  const fraction = tyreCliffFraction(spec, player.tyreAge)
  const fillPct = Math.min(fraction * 100, 100)
  const color = cliffColor(fraction)
  const isPulsing = fraction >= 0.85

  return (
    <div style={{
      background: 'var(--bg-panel)', borderRadius: 8, padding: '10px 14px',
      border: '1px solid var(--line-hair)', minWidth: 150,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 8,
      }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
          TYRES
        </span>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
          color, letterSpacing: '0.05em',
        }}>
          {COMPOUND_LABEL[player.compound] ?? player.compound} · L{player.tyreAge}
        </span>
      </div>

      <div style={{
        height: 6, borderRadius: 3,
        background: 'var(--bg-elevated)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', borderRadius: 3,
          width: `${fillPct}%`,
          background: color,
          boxShadow: `0 0 8px ${color}`,
          transition: 'width 0.4s ease, background 0.4s ease',
          animation: isPulsing ? 'pulse-bar 1s ease-in-out infinite' : 'none',
        }} />
      </div>

      {fraction >= 1.0 && (
        <div style={{
          marginTop: 6, fontFamily: 'var(--font-display)', fontSize: 11,
          color: 'var(--accent-warm)', fontWeight: 700, letterSpacing: '0.1em',
          textAlign: 'center',
        }}>
          BOX BOX BOX
        </div>
      )}

      <style>{`
        @keyframes pulse-bar {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
