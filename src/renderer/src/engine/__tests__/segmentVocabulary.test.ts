import { describe, expect, it } from 'vitest'
import type { TextRecord } from '../../types'
import { isSeededTextRecord, resolveTextSegmentVocabulary } from '../segmentVocabulary'

describe('segmentVocabulary', () => {
  it('reports seeded text records by seed_id presence', () => {
    expect(isSeededTextRecord({ seed_id: 'default-book' })).toBe(true)
    expect(isSeededTextRecord({})).toBe(false)
  })

  it('uses chapter vocabulary for seeded texts', () => {
    const text: Pick<TextRecord, 'seed_id'> = { seed_id: 'default-book' }

    expect(resolveTextSegmentVocabulary(text)).toEqual({
      isSeeded: true,
      noun: {
        singular: 'chapter',
        plural: 'chapters',
      },
    })
  })

  it('uses content vocabulary for user texts', () => {
    expect(resolveTextSegmentVocabulary({})).toEqual({
      isSeeded: false,
      noun: {
        singular: 'content',
        plural: 'contents',
      },
    })
  })
})
