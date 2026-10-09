import { useUiTap } from '@hooks/useUiTap'
export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: {
  options: { value: T; label: string; sub?: string }[]; value: T; onChange: (v: T) => void; ariaLabel: string
}) {
  const uiTap = useUiTap()
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="slant-md"
      style={{ display: 'flex', gap: 2, background: 'var(--grape)', padding: '4px 14px' }}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} className={`${on ? 'slant-sm ' : ''}kit-focus`}
            onClick={() => { uiTap(); onChange(o.value) }}
            style={{ flex: 1, minHeight: 48, border: 'none', cursor: 'pointer', background: on ? 'var(--white)' : 'transparent',
              color: on ? 'var(--ink)' : 'var(--lilac)', fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 14,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {o.label}
            {o.sub && <span style={{ fontWeight: 600, fontSize: 10, color: on ? 'var(--dusk)' : 'var(--lilac-dim)' }}>{o.sub}</span>}
          </button>
        )
      })}
    </div>
  )
}
