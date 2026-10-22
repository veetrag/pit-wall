import { useRef, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import type { PendingOffer } from '@state/careerStore'
import { loadGameData } from '@data/validators'
import { PRESS, snapIn, useReducedMotion } from '@ui/kit'
import { useUiTap } from '@hooks/useUiTap'

const TEAMS = new Map(loadGameData().cars.teams.map(t => [t.id, t]))
const label = { fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12, letterSpacing: '0.14em', color: 'var(--lilac-dim)' } as const

/** Spec 1.6 §12: the seat on offer. ACCEPT / STAY is a choice; NEXT SEASON applies it. */
export function OfferCard({ offer, choice, onChoice }: { offer: PendingOffer; choice: 'stay' | 'accept'; onChoice: (c: 'stay' | 'accept') => void }) {
  const reduced = useReducedMotion()
  const uiTap = useUiTap()
  const team = TEAMS.get(offer.teamId)
  const name = (team?.name ?? offer.teamId).toUpperCase()
  const radios = useRef(new Map<'stay' | 'accept', HTMLButtonElement>())
  // Arrow-key roving across the two radios (the RedFlagCard pattern).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (dir === 0) return
    e.preventDefault()
    const order = ['accept', 'stay'] as const
    const next = order[(order.indexOf(choice) + dir + order.length) % order.length]!
    uiTap(); onChoice(next)
    radios.current.get(next)?.focus()
  }
  const opt = (c: 'stay' | 'accept', text: string) => (
    <motion.button type="button" role="radio" aria-checked={choice === c} className="slant-sm kit-focus"
      tabIndex={choice === c ? 0 : -1} ref={(el: HTMLButtonElement | null) => { if (el) radios.current.set(c, el); else radios.current.delete(c) }}
      whileTap={reduced ? undefined : { scale: 0.96 }} transition={PRESS} onClick={() => { uiTap(); onChoice(c) }}
      style={{ flex: 1, minHeight: 48, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 900,
        fontStyle: 'italic', fontSize: 22, background: choice === c ? 'var(--white)' : 'var(--dusk)', color: choice === c ? 'var(--ink)' : 'var(--white)' }}>
      {choice === c ? `✓ ${text}` : text}
    </motion.button>
  )
  return (
    <motion.section {...snapIn(reduced)} role="region" aria-label={`Offer from ${name}`} className="slant-lg"
      style={{ position: 'relative', overflow: 'hidden', margin: '0 16px', background: 'var(--grape)', padding: '16px 18px 16px 26px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: team?.colorPrimary ?? 'var(--dusk)' }} />
      <span style={label}>{offer.reason === 'title' ? 'THE CHAMPION GETS A CALL' : 'YOU BEAT YOUR BOARD TARGET'}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 30, lineHeight: 1, color: 'var(--white)' }}>{name} WANTS YOU</span>
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14, color: 'var(--lilac)', fontVariantNumeric: 'tabular-nums' }}>
        CAR RATING {offer.rating} vs YOURS {offer.currentRating}
      </span>
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 13, color: 'var(--white)' }}>
        BOARD TARGET · P{offer.boardTarget} IN THE CONSTRUCTORS'
      </span>
      <div role="radiogroup" aria-label="Your answer" onKeyDown={onKeyDown} style={{ display: 'flex', gap: 8 }}>
        {opt('accept', 'ACCEPT')}
        {opt('stay', 'STAY')}
      </div>
    </motion.section>
  )
}
