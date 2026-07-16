import { describe, it, expect } from 'vitest'
import { buildReaderCssVars } from '../readerCssVars'

describe('buildReaderCssVars', () => {
  it('returns an empty object when nothing is set', () => {
    expect(buildReaderCssVars({})).toEqual({})
  })

  it('maps every provided value to its --rd-* variable', () => {
    expect(buildReaderCssVars({
      highlightColor: '#f00',
      stageBgColor: '#111',
      textColor: '#eee',
      fontFamily: 'Georgia',
      highlightTextColor: '#000',
    })).toEqual({
      '--rd-highlight': '#f00',
      '--rd-stage-bg': '#111',
      '--rd-text': '#eee',
      '--rd-font': 'Georgia',
      '--rd-highlight-text': '#000',
    })
  })

  it('omits empty-string values so stylesheet defaults apply', () => {
    expect(buildReaderCssVars({
      highlightColor: '',
      stageBgColor: '#111',
      textColor: '',
      fontFamily: '',
      highlightTextColor: null,
    })).toEqual({ '--rd-stage-bg': '#111' })
  })

  it('omits a null highlight text color (unresolved)', () => {
    expect(buildReaderCssVars({ highlightTextColor: null })).toEqual({})
  })
})
