import { describe, expect, it } from 'vitest'
import { isLocalNavigationUrl } from '../navigationPolicy'

describe('isLocalNavigationUrl', () => {
  it('allows packaged file navigation', () => {
    expect(isLocalNavigationUrl('file:///C:/WingletReader/out/renderer/index.html')).toBe(true)
  })

  it('allows the configured dev renderer origin', () => {
    expect(
      isLocalNavigationUrl(
        'http://localhost:5173/index.html?temporaryReader=1',
        'http://localhost:5173/'
      )
    ).toBe(true)
  })

  it('denies non-local origins', () => {
    expect(isLocalNavigationUrl('https://example.com/', 'http://localhost:5173/')).toBe(false)
  })

  it('denies invalid URLs', () => {
    expect(isLocalNavigationUrl('not a url')).toBe(false)
  })
})
