import { describe, expect, it } from 'vitest'
import {
  resolveStartupSplashOptions,
  SPLASH_BRAND_FLOOR_FRAME,
  SPLASH_FRAME_RATE,
  SPLASH_INTRO_FRAMES,
} from '../splashOptions'

function frameDelayMs(frame: number): number {
  return Math.round(frame / SPLASH_FRAME_RATE * 1000)
}

describe('resolveStartupSplashOptions', () => {
  it('keeps dev startup splash-free by default', () => {
    expect(resolveStartupSplashOptions({ isPackaged: false })).toEqual({
      enabled: false,
      revealMode: 'brand-floor',
      revealDelayMs: frameDelayMs(SPLASH_BRAND_FLOOR_FRAME)
    })
  })

  it('keeps packaged startup on the brand-floor reveal by default', () => {
    expect(resolveStartupSplashOptions({ isPackaged: true })).toEqual({
      enabled: true,
      revealMode: 'brand-floor',
      revealDelayMs: frameDelayMs(SPLASH_BRAND_FLOOR_FRAME)
    })
  })

  it('preserves SPLASH=1 as the dev brand-floor option', () => {
    expect(resolveStartupSplashOptions({ isPackaged: false, envSplash: '1' })).toEqual({
      enabled: true,
      revealMode: 'brand-floor',
      revealDelayMs: frameDelayMs(SPLASH_BRAND_FLOOR_FRAME)
    })
  })

  it('forces the full intro through the SPLASH boot option without changing packaged defaults', () => {
    expect(resolveStartupSplashOptions({ isPackaged: false, envSplash: 'full' })).toEqual({
      enabled: true,
      revealMode: 'full-intro',
      revealDelayMs: frameDelayMs(SPLASH_INTRO_FRAMES)
    })
  })

  it('also accepts command-line full-intro options', () => {
    expect(resolveStartupSplashOptions({
      isPackaged: false,
      argv: ['electron', '.', '--splash=full']
    }).revealMode).toBe('full-intro')

    expect(resolveStartupSplashOptions({
      isPackaged: false,
      argv: ['electron', '.', '--force-splash-animation']
    }).revealMode).toBe('full-intro')
  })
})
