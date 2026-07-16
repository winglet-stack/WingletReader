/**
 * WPM solver — finds the best (BPM, wordsPerStack) pair that hits a target WPM.
 *
 * WPM = BPM × wordsPerStack.
 * Given a targetWpm and valid-range constraints, the solver enumerates all
 * possible wordsPerStack values, snaps the ideal BPM to the allowed step grid,
 * clamps it, and picks the combination whose effective WPM is closest to the target.
 * Ties are broken by preferring the smaller wordsPerStack (fewer words = less
 * cognitive load per stack, which favours speed).
 */

export interface WpmSolution {
  bpm: number
  wordsPerStack: number
  /** Actual WPM produced by this solution (bpm × wordsPerStack). */
  effectiveWpm: number
}

export interface WpmConstraints {
  bpmMin: number
  bpmMax: number
  /** BPM must be a multiple of this step (e.g. 5 for the reader slider). */
  bpmStep: number
  wpsMin: number
  wpsMax: number
}

/** Constraints matching the Reader / quick-settings BPM slider and words-per-stack input. */
export const READER_WPM_CONSTRAINTS: WpmConstraints = {
  bpmMin: 20, bpmMax: 1200, bpmStep: 5,
  wpsMin: 1,  wpsMax: 10,
}

/** Constraints matching the Script Builder block-settings BPM input. */
export const SCRIPT_WPM_CONSTRAINTS: WpmConstraints = {
  bpmMin: 10, bpmMax: 1200, bpmStep: 1,
  wpsMin: 1,  wpsMax: 20,
}

/**
 * Return the (BPM, wordsPerStack) combination whose `bpm × wordsPerStack`
 * is closest to `targetWpm` within the given constraints.
 *
 * The returned `effectiveWpm` will equal `bpm × wordsPerStack` and may differ
 * from `targetWpm` when an exact match is impossible given the constraints.
 */
export function solveForTargetWpm(
  targetWpm: number,
  constraints: WpmConstraints
): WpmSolution {
  const { bpmMin, bpmMax, bpmStep, wpsMin, wpsMax } = constraints

  let best: WpmSolution | null = null
  let bestError = Infinity

  for (let wps = wpsMin; wps <= wpsMax; wps++) {
    // Ideal BPM for this WPS — snap to the nearest step grid point then clamp.
    const idealBpm = targetWpm / wps
    const snapped = Math.round(idealBpm / bpmStep) * bpmStep
    const bpm = Math.max(bpmMin, Math.min(bpmMax, snapped))
    const effective = bpm * wps
    const error = Math.abs(effective - targetWpm)

    // Prefer smaller error; on equal error prefer smaller WPS.
    if (error < bestError || (error === bestError && wps < (best?.wordsPerStack ?? Infinity))) {
      best = { bpm, wordsPerStack: wps, effectiveWpm: effective }
      bestError = error
    }
  }

  // best is always set because wpsMin ≤ wpsMax and both are ≥ 1
  return best!
}

/** Minimum and maximum target WPM shown in the Reader UI slider. */
export const READER_TARGET_WPM_MIN = 0
export const READER_TARGET_WPM_MAX = 3500
const READER_TARGET_WPM_STEP = 5
export const READER_TARGET_WPM_SLIDER_MIN = 0
export const READER_TARGET_WPM_SLIDER_MAX = 1000
export const READER_TARGET_WPM_SLIDER_STEP = 1
export const READER_TARGET_WPM_LINEAR_MAX = 1000
const READER_TARGET_WPM_LINEAR_SLIDER_RATIO = 0.75

const READER_TARGET_WPM_LINEAR_SLIDER_MAX =
  READER_TARGET_WPM_SLIDER_MAX * READER_TARGET_WPM_LINEAR_SLIDER_RATIO

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step
}

export function clampReaderTargetWpm(targetWpm: number): number {
  return Math.max(READER_TARGET_WPM_MIN, Math.min(READER_TARGET_WPM_MAX, targetWpm))
}

/**
 * Maps the compact 0-1000 slider position to target WPM. The first 75% of the
 * slider is linear from 0-1000 WPM; the last 25% grows exponentially to the cap.
 */
export function sliderToReaderTargetWpm(sliderValue: number): number {
  const clampedSlider = Math.max(
    READER_TARGET_WPM_SLIDER_MIN,
    Math.min(READER_TARGET_WPM_SLIDER_MAX, sliderValue)
  )

  if (clampedSlider <= READER_TARGET_WPM_LINEAR_SLIDER_MAX) {
    const linearValue =
      (clampedSlider / READER_TARGET_WPM_LINEAR_SLIDER_MAX) * READER_TARGET_WPM_LINEAR_MAX
    return clampReaderTargetWpm(roundToStep(linearValue, READER_TARGET_WPM_STEP))
  }

  const exponentialT =
    (clampedSlider - READER_TARGET_WPM_LINEAR_SLIDER_MAX) /
    (READER_TARGET_WPM_SLIDER_MAX - READER_TARGET_WPM_LINEAR_SLIDER_MAX)
  const exponentialValue =
    READER_TARGET_WPM_LINEAR_MAX *
    Math.pow(READER_TARGET_WPM_MAX / READER_TARGET_WPM_LINEAR_MAX, exponentialT)

  return clampReaderTargetWpm(roundToStep(exponentialValue, READER_TARGET_WPM_STEP))
}

/** Inverse of sliderToReaderTargetWpm for rendering a saved target WPM on the slider. */
export function readerTargetWpmToSlider(targetWpm: number): number {
  const clampedTarget = clampReaderTargetWpm(targetWpm)

  if (clampedTarget <= READER_TARGET_WPM_LINEAR_MAX) {
    return roundToStep(
      (clampedTarget / READER_TARGET_WPM_LINEAR_MAX) * READER_TARGET_WPM_LINEAR_SLIDER_MAX,
      READER_TARGET_WPM_SLIDER_STEP
    )
  }

  const exponentialT =
    Math.log(clampedTarget / READER_TARGET_WPM_LINEAR_MAX) /
    Math.log(READER_TARGET_WPM_MAX / READER_TARGET_WPM_LINEAR_MAX)

  return roundToStep(
    READER_TARGET_WPM_LINEAR_SLIDER_MAX +
      exponentialT * (READER_TARGET_WPM_SLIDER_MAX - READER_TARGET_WPM_LINEAR_SLIDER_MAX),
    READER_TARGET_WPM_SLIDER_STEP
  )
}

/** Minimum and maximum target WPM shown in the Script Builder UI slider. */
// Script Builder is archived but still compiled; keep these exports buildable.
// fallow-ignore-next-line unused-export
export const SCRIPT_TARGET_WPM_MIN = 10
// fallow-ignore-next-line unused-export
export const SCRIPT_TARGET_WPM_MAX = 24000
// fallow-ignore-next-line unused-export
export const SCRIPT_TARGET_WPM_STEP = 10
