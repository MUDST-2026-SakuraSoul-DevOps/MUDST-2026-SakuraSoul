import { describe, expect, it } from 'vitest'
import { activeSectionView, legacyPreviewUrl, sectionUrl, sectionViews } from './navigation'

describe('Figma-aligned preview information architecture', () => {
  it('gives utility and financial reports one canonical home', () => {
    expect(legacyPreviewUrl('utilities','')).toBe('/phase2-preview/units?view=utilities')
    expect(legacyPreviewUrl('reports','')).toBe('/phase2-preview/payments?view=reports')
  })
  it.each([['Contract','contracts'],['Receipt','payments'],['Maintenance report','maintenance']])('routes %s files to their owning section', (type,section) => {
    const url = legacyPreviewUrl('documents',new URLSearchParams({type,unit:'101',upload:'1'}).toString())
    const parsed = new URL(url!, 'http://localhost')
    expect(parsed.pathname).toBe(`/phase2-preview/${section}`)
    expect(parsed.searchParams.get('view')).toBe('documents')
    expect(parsed.searchParams.get('unit')).toBe('101')
    expect(parsed.searchParams.get('upload')).toBe('1')
  })
  it('retains the team-settings link and leaves main routes alone', () => {
    expect(legacyPreviewUrl('permissions','')).toBe('/phase2-preview/settings?tab=team')
    expect(legacyPreviewUrl('contracts','')).toBeNull()
  })
  it('chooses the correct room context and defaults to the original maintenance task view', () => {
    expect(activeSectionView('units',new URLSearchParams('room=201'))).toBe('rates')
    expect(activeSectionView('units',new URLSearchParams('room=201&view=utilities'))).toBe('utilities')
    expect(activeSectionView('maintenance',new URLSearchParams())).toBe('tasks')
    expect(sectionViews.maintenance.map(i => i.value)).toEqual(['tasks','supplies','schedule','log','documents'])
  })
  it('does not reopen a file picker or invoice draft when changing section views', () => {
    const result = sectionUrl('payments','history',new URLSearchParams('upload=1&draft=101&room=101'))
    expect(result).toBe('/phase2-preview/payments?room=101&view=history')
  })
})
