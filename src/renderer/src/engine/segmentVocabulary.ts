import type { TextRecord } from '../types'

export type SegmentNoun = {
  singular: 'chapter' | 'content'
  plural: 'chapters' | 'contents'
}

export type TextSegmentVocabulary = {
  isSeeded: boolean
  noun: SegmentNoun
}

const seededSegmentNoun: SegmentNoun = {
  singular: 'chapter',
  plural: 'chapters',
}

const userSegmentNoun: SegmentNoun = {
  singular: 'content',
  plural: 'contents',
}

export function isSeededTextRecord(text: Pick<TextRecord, 'seed_id'>): boolean {
  return text.seed_id !== undefined
}

export function resolveTextSegmentVocabulary(text: Pick<TextRecord, 'seed_id'>): TextSegmentVocabulary {
  const isSeeded = isSeededTextRecord(text)
  return {
    isSeeded,
    noun: isSeeded ? seededSegmentNoun : userSegmentNoun,
  }
}
