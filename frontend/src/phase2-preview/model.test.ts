import { describe, expect, it } from 'vitest'
import { nameDistance, parseUsageCsv, sampleCsv } from './model'

describe('Phase 2 preview data boundaries', () => {
  it('accepts a template and quoted fields from a Windows CSV', () => {
    expect(parseUsageCsv(sampleCsv)).toHaveLength(3)
    expect(parseUsageCsv('\uFEFFroom,billing_month,water_m3,electricity_kwh\r\n"101","2026-11","10.25",124\r\n')).toEqual([{room:'101',month:'2026-11',water:10.25,electricity:124}])
  })
  it('rejects duplicate room/month rows before any import', () => {
    expect(() => parseUsageCsv(sampleCsv + '101,2026-11,5,50\n')).toThrow('duplicate')
  })
  it.each(['101,2026-11,-5,50','101,2026-11,,50','101,2026-13,5,50','999,2026-11,5,50','101,2026-11,5,Infinity'])('rejects an invalid usage record: %s', row => {
    expect(() => parseUsageCsv(`room,billing_month,water_m3,electricity_kwh\n${row}`)).toThrow()
  })
  it('rejects incorrect headers and unclosed quotes', () => {
    expect(() => parseUsageCsv('room,month,water,electricity\n101,2026-11,1,2')).toThrow('four columns')
    expect(() => parseUsageCsv('room,billing_month,water_m3,electricity_kwh\n"101,2026-11,1,2')).toThrow('Unclosed quote')
  })
  it('finds both required name misspellings with edit distance one', () => {
    expect(nameDistance('kart','kant')).toBe(1)
    expect(nameDistance('krant','kant')).toBe(1)
    expect(nameDistance('mali','kant')).toBeGreaterThan(1)
  })
})
