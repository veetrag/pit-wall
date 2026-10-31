import type { KeyboardEvent } from 'react'
import { useUiTap } from '@hooks/useUiTap'
export function Tabs<T extends string>({ tabs, value, onChange, ariaLabel, idPrefix }: {
  idPrefix?: string
  tabs: { value: T; label: string }[]; value: T; onChange: (v: T) => void; ariaLabel: string
}) {
  const uiTap = useUiTap()
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const i = tabs.findIndex(t => t.value === value)
    const next = tabs[(i + step + tabs.length) % tabs.length]
    if (!next) return
    uiTap(); onChange(next.value)
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[tabs.indexOf(next)]?.focus()
  }
  return (
    <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className="slant-md"
      style={{ display: 'flex', gap: 2, background: 'var(--grape)', padding: '4px 14px' }}>
      {tabs.map(t => {
        const on = t.value === value
        return (
          <button key={t.value} type="button" role="tab" aria-selected={on}
            {...(idPrefix ? { id: `${idPrefix}-tab-${t.value}`, 'aria-controls': `${idPrefix}-panel` } : {})} tabIndex={on ? 0 : -1}
            className={`${on ? 'slant-sm ' : ''}kit-focus`} onClick={() => { uiTap(); onChange(t.value) }}
            style={{ flex: 1, minHeight: 48, padding: '0 14px', border: 'none', cursor: 'pointer',
              background: on ? 'var(--white)' : 'transparent', color: on ? 'var(--ink)' : 'var(--lilac)',
              fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 13 }}>{t.label}</button>
        )
      })}
    </div>
  )
}
