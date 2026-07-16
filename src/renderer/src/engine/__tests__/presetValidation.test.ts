import { describe, it, expect } from 'vitest'
import { parseNamedRecordBase } from '../presetValidation'

describe('parseNamedRecordBase', () => {
  it('returns base for a valid envelope', () => {
    const result = parseNamedRecordBase({ id: 'preset:foo', name: 'Foo', extra: 42 })
    expect(result).toEqual({ p: { id: 'preset:foo', name: 'Foo', extra: 42 }, id: 'preset:foo', name: 'Foo' })
  })

  it('returns null for null', () => {
    expect(parseNamedRecordBase(null)).toBeNull()
  })

  it('returns null for a non-object', () => {
    expect(parseNamedRecordBase('string')).toBeNull()
    expect(parseNamedRecordBase(42)).toBeNull()
  })

  it('returns null when id is missing', () => {
    expect(parseNamedRecordBase({ name: 'Foo' })).toBeNull()
  })

  it('returns null when id is empty string', () => {
    expect(parseNamedRecordBase({ id: '', name: 'Foo' })).toBeNull()
  })

  it('returns null when id is not a string', () => {
    expect(parseNamedRecordBase({ id: 123, name: 'Foo' })).toBeNull()
  })

  it('returns null when name is missing', () => {
    expect(parseNamedRecordBase({ id: 'preset:foo' })).toBeNull()
  })

  it('returns null when name is empty string', () => {
    expect(parseNamedRecordBase({ id: 'preset:foo', name: '' })).toBeNull()
  })

  it('returns null when name is not a string', () => {
    expect(parseNamedRecordBase({ id: 'preset:foo', name: 0 })).toBeNull()
  })
})
