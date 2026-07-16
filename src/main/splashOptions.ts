export type SplashRevealMode = 'brand-floor' | 'full-intro' | 'loop'

export interface StartupSplashOptionsInput {
  isPackaged: boolean
  envSplash?: string
  argv?: string[]
}

export interface StartupSplashOptions {
  enabled: boolean
  revealMode: SplashRevealMode
  revealDelayMs: number
}

export const SPLASH_FRAME_RATE = 15
export const SPLASH_BRAND_FLOOR_FRAME = 8
export const SPLASH_INTRO_FRAMES = 22

const SPLASH_BRAND_FLOOR_VALUES = new Set(['1', 'true', 'on', 'yes', 'brand-floor'])
const SPLASH_FULL_INTRO_VALUES = new Set(['full', 'full-intro', 'full-animation', 'force-full'])
const SPLASH_LOOP_VALUES = new Set(['loop', 'inspect', 'repeat'])

function frameDelayMs(frame: number): number {
  return Math.round(frame / SPLASH_FRAME_RATE * 1000)
}

function parseSplashValue(value: string | undefined): SplashRevealMode | null {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return null
  if (SPLASH_LOOP_VALUES.has(normalized)) return 'loop'
  if (SPLASH_FULL_INTRO_VALUES.has(normalized)) return 'full-intro'
  if (SPLASH_BRAND_FLOOR_VALUES.has(normalized)) return 'brand-floor'
  return null
}

function splashModeFromArgv(argv: string[] = []): SplashRevealMode | null {
  for (const arg of argv) {
    if (arg === '--splash-loop' || arg === '--splash-inspect') return 'loop'
    if (arg === '--splash-full' || arg === '--force-splash-animation') return 'full-intro'
    if (arg === '--splash') return 'brand-floor'
    if (arg.startsWith('--splash=')) return parseSplashValue(arg.slice('--splash='.length))
  }
  return null
}

export function resolveStartupSplashOptions(input: StartupSplashOptionsInput): StartupSplashOptions {
  const requestedMode = splashModeFromArgv(input.argv) ?? parseSplashValue(input.envSplash)
  const revealMode = requestedMode ?? 'brand-floor'

  return {
    enabled: input.isPackaged || requestedMode !== null,
    revealMode,
    // loop mode has no auto-reveal; revealDelayMs is unused in that path
    revealDelayMs: revealMode === 'loop' ? 0 : frameDelayMs(revealMode === 'full-intro'
      ? SPLASH_INTRO_FRAMES
      : SPLASH_BRAND_FLOOR_FRAME)
  }
}
