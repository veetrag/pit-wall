import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const LEGACY = ['--bg-deep', '--bg-panel', '--bg-elevated', '--text-hi', '--text-mid', '--text-dim',
  '--accent', '--accent-rgb', '--accent-warm', '--accent-violet', '--negative', '--positive', '--positive-rgb', '--font-mono']
const files: string[] = []
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(f) && files.push(p) } }
walk(join(__dirname, '../../src'))

describe('Race Day Bold token names only', () => {
  it.each(LEGACY)('%s is gone from src/', name => {
    const re = new RegExp(`${name.replace(/-/g, '\\-')}(?![\\w-])`)
    const hits = files.filter(f => re.test(readFileSync(f, 'utf8')))
    expect(hits, hits.join('\n')).toEqual([])
  })
})
