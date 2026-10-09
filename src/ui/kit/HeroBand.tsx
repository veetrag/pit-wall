// Decorative slanted colour band behind a hero (spec 3.3)
export function HeroBand({ color, height, top = 0, stripes = true }: { color: string; height: number; top?: number; stripes?: boolean }) {
  return <div aria-hidden="true" className={`hero-band${stripes ? ' hero-band-stripes' : ''}`}
    style={{ top, height, backgroundColor: color }} />
}
