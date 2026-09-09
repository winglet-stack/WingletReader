import { describe, expect, it } from 'vitest'
import type { TextRecord } from '../../types'
import {
  isPublisherChapteredTextRecord,
  isSeededTextRecord,
  resolveTextSegmentVocabulary,
} from '../segmentVocabulary'

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

  // ADR-0034 §8 — the second publisher-chaptered origin.
  it('uses chapter vocabulary for EPUB books without marking them seeded', () => {
    const text: Pick<TextRecord, 'source_type'> = { source_type: 'epub' }

    expect(resolveTextSegmentVocabulary(text)).toEqual({
      // `isSeeded: false` is the point: the noun moved, the mutability axis did
      // not. Conflating the two would silently take Add Content away from EPUB
      // books.
      isSeeded: false,
      noun: {
        singular: 'chapter',
        plural: 'chapters',
      },
    })
  })

  it('keeps content vocabulary for the other import source types', () => {
    for (const source_type of ['text', 'pdf', 'docx'] as const) {
      expect(resolveTextSegmentVocabulary({ source_type }).noun.plural).toBe('contents')
    }
  })

  it('reports the publisher-chaptered axis as the union of the two origins', () => {
    expect(isPublisherChapteredTextRecord({ seed_id: 'default-book' })).toBe(true)
    expect(isPublisherChapteredTextRecord({ source_type: 'epub' })).toBe(true)
    expect(isPublisherChapteredTextRecord({ seed_id: 'default-book', source_type: 'epub' })).toBe(true)
    expect(isPublisherChapteredTextRecord({ source_type: 'docx' })).toBe(false)
    expect(isPublisherChapteredTextRecord({})).toBe(false)
  })
})
