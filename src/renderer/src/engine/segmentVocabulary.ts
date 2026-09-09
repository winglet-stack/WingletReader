import type { TextRecord } from '../types'

export type SegmentNoun = {
  singular: 'chapter' | 'content'
  plural: 'chapters' | 'contents'
}

export type TextSegmentVocabulary = {
  /**
   * Curated-book identity only (`seed_id`). This is the **mutability** axis —
   * it is what suppresses Add Content — and it is deliberately narrower than the
   * axis that picks the noun (ADR-0034 §8).
   */
  isSeeded: boolean
  noun: SegmentNoun
}

/** The fields the origin vocabulary reads; both live in the `getTexts` list projection. */
export type SegmentVocabularySource = Pick<TextRecord, 'seed_id' | 'source_type'>

const chapterSegmentNoun: SegmentNoun = {
  singular: 'chapter',
  plural: 'chapters',
}

const contentSegmentNoun: SegmentNoun = {
  singular: 'content',
  plural: 'contents',
}

export function isSeededTextRecord(text: Pick<TextRecord, 'seed_id'>): boolean {
  return text.seed_id !== undefined
}

/**
 * Origins whose segments the *publisher* resolved, so the user-facing noun is
 * "chapters" (ADR-0023 as extended by ADR-0034 §8): a Winglet Book (`seed_id`)
 * or an EPUB book (`source_type: 'epub'`). Every other user text says
 * "contents". A novel labelled "contents" reads as a bug.
 */
export function isPublisherChapteredTextRecord(text: SegmentVocabularySource): boolean {
  return isSeededTextRecord(text) || text.source_type === 'epub'
}

export function resolveTextSegmentVocabulary(text: SegmentVocabularySource): TextSegmentVocabulary {
  return {
    isSeeded: isSeededTextRecord(text),
    noun: isPublisherChapteredTextRecord(text) ? chapterSegmentNoun : contentSegmentNoun,
  }
}
