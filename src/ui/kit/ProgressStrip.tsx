export function ProgressStrip({ total, done, ariaLabel }: { total: number; done: number; ariaLabel?: string }) {
  return <div role="img" aria-label={ariaLabel ?? `${done} of ${total} rounds done`}
    style={{ display: 'grid', gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))`, gap: 3 }}>
    {Array.from({ length: total }, (_, i) => (
      <span key={i} style={{ height: 8, transform: 'skewX(-20deg)',
        background: i < done ? 'var(--volt)' : i === done ? 'var(--white)' : 'var(--dusk)' }} />
    ))}
  </div>
}
