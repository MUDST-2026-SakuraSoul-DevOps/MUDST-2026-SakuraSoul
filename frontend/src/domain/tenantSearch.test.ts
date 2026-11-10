import { describe, expect, it } from 'vitest'
import { editDistance, matchName, rankByName } from './tenantSearch'

const people = [
  { id: 1, fullName: 'Kant Srisuk' },
  { id: 2, fullName: 'Mali Prasert' },
  { id: 3, fullName: 'Kanthida Wong' },
  { id: 4, fullName: 'สมชาย ใจดี' },
]
const names = (q: string) => rankByName(people, q).map((p) => `${p.fullName}:${p.match}`)

describe('the instructor examples (SSK-174 AC)', () => {
  it.each([
    ['kant', 'EXACT'],
    ['krant', 'SIMILAR'],
    ['kart', 'SIMILAR'],
    ['KANT', 'EXACT'],
  ])('%s finds Kant', (q, match) => {
    expect(names(q)[0]).toBe(`Kant Srisuk:${match}`)
  })

  it('xyz finds nobody', () => {
    expect(names('xyz')).toEqual([])
  })

  // exact matches come before similar ones
  it('puts exact and prefix matches before similar ones', () => {
    expect(names('kant')).toEqual(['Kant Srisuk:EXACT', 'Kanthida Wong:PREFIX'])
  })

  // the old partial search still works
  it('still finds a part of the name', () => {
    expect(names('pras')).toEqual(['Mali Prasert:PREFIX'])
    expect(names('thid')).toEqual(['Kanthida Wong:CONTAINS'])
  })
})

describe('Thai names', () => {
  it('finds the exact first name', () => {
    expect(names('สมชาย')).toEqual(['สมชาย ใจดี:EXACT'])
  })
  it('finds a name with a missing vowel', () => {
    expect(names('สมชย')).toEqual(['สมชาย ใจดี:SIMILAR'])
  })
  it('finds a name with one wrong consonant', () => {
    expect(names('สมขาย')).toEqual(['สมชาย ใจดี:SIMILAR'])
  })
})

describe('edge cases', () => {
  it('ignores blank queries and extra spaces', () => {
    expect(names('   ')).toEqual([])
    expect(names('  kant   srisuk ')).toEqual(['Kant Srisuk:EXACT'])
  })

  it('does not fuzzy-match very short queries', () => {
    expect(matchName('Kant Srisuk', 'ka')).toEqual({ match: 'PREFIX', distance: 0 })
    expect(matchName('Kant Srisuk', 'kx')).toBeNull()
  })

  it('treats special characters as plain text', () => {
    expect(names('k.*t')).toEqual([])
  })

  it('counts a swap of two letters as one edit', () => {
    expect(editDistance('knat', 'kant')).toBe(1)
    expect(editDistance('krant', 'kant')).toBe(1)
  })
})
