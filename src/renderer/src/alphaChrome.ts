import type { AppView } from './types'

export const alphaChrome = {
  postReadingSummaryEnabled: false,
  importTextProcessingEnabled: false,
  importTileCreateVideoEnabled: false,
  transmuteExperimentalBannerEnabled: true,
  hideDeadRoutes: true,
  transmuteExperimentalBannerCopy:
    'Transmute is experimental in this alpha. Video exports may be incomplete, visually wrong, or fail. Do not rely on exported videos for important work.',
} as const

const alphaDeadRoutes = new Set<AppView>([
  'showcase',
  'mode-choice',
  'summaries',
  'primer',
  'trailer',
])

export function isAlphaDeadRoute(view: AppView): boolean {
  return alphaChrome.hideDeadRoutes && alphaDeadRoutes.has(view)
}

export function resolveAlphaView(view: AppView): AppView {
  return isAlphaDeadRoute(view) ? 'library' : view
}
