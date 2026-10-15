import { describe, expect, it } from 'vitest'

/**
 * SSK-121: colours live as tokens in index.css (@theme), not as text-[#504444]
 * scattered across components. If a new colour is needed, add a token there.
 */
const sources = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

describe('design tokens', () => {
  it('components use colour tokens instead of arbitrary hex classes', () => {
    const offenders = Object.entries(sources).flatMap(([file, source]) =>
      [...source.matchAll(/[\w:-]+-\[#[0-9a-fA-F]{3,8}\](\/\d+)?/g)].map((m) => `${file}: ${m[0]}`),
    )
    expect(Object.keys(sources).length).toBeGreaterThan(30)
    expect(offenders).toEqual([])
  })
})
