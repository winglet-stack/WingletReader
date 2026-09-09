export const alphaChrome = {
  postReadingSummaryEnabled: false,
  importTextProcessingEnabled: false,
  importTileCreateVideoEnabled: false,
  transmuteExperimentalBannerEnabled: true,
  transmuteExperimentalBannerCopy:
    'Transmute is experimental in this alpha. Video exports may be incomplete, visually wrong, or fail. Do not rely on exported videos for important work.',
  rwwExperimentalBannerEnabled: true,
  rwwExperimentalBannerCopy:
    'Read While Working is in active development. Capture and overlay behavior can change between builds, and the overlay may miss or mis-read selections in some apps.',
  epubExperimentalBannerEnabled: true,
  epubExperimentalBannerCopy:
    "EPUB text is imported as published, without the usual cleanup, so spacing and punctuation can look unusual. Chapter structure comes from the book's own table of contents, and some books lack a good one.",
  portableExperimentalBannerEnabled: true,
  portableExperimentalBannerCopy:
    'The portable drive path has not been verified on a real machine end to end in this alpha. Keep a backup of your data before relying on it.',
} as const

// The alpha dead-route set (`showcase`, `mode-choice`, `summaries`, `primer`,
// `trailer`) lived here with a `hideDeadRoutes` flag and two redirect helpers.
// Those destinations are archived, not merely hidden, so they are gone from the
// view union entirely; liveness is now declared per destination in
// `appShell/routeTable.tsx` and enforced once, where the shell resolves a route.
