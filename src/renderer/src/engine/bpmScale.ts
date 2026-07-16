export const READER_BPM_MIN = 20
export const READER_BPM_MAX = 650
export const READER_BPM_STEP = 5

export const BPM_SLIDER_MIN = 0
export const BPM_SLIDER_MAX = 1000
export const BPM_SLIDER_STEP = 1

const BPM_SLIDER_EXPONENT = 3.2

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val))
}

function snapBpm(value: number) {
  return Math.round(value / READER_BPM_STEP) * READER_BPM_STEP
}

export function sliderToBpm(sliderValue: number): number {
  const normalized = clamp(
    (sliderValue - BPM_SLIDER_MIN) / (BPM_SLIDER_MAX - BPM_SLIDER_MIN),
    0,
    1
  )
  const bpm = READER_BPM_MIN + (READER_BPM_MAX - READER_BPM_MIN) * Math.pow(normalized, BPM_SLIDER_EXPONENT)
  return clamp(snapBpm(bpm), READER_BPM_MIN, READER_BPM_MAX)
}

export function bpmToSlider(bpm: number): number {
  const normalized = clamp(
    (bpm - READER_BPM_MIN) / (READER_BPM_MAX - READER_BPM_MIN),
    0,
    1
  )
  const sliderValue = BPM_SLIDER_MIN +
    (BPM_SLIDER_MAX - BPM_SLIDER_MIN) * Math.pow(normalized, 1 / BPM_SLIDER_EXPONENT)
  return Math.round(sliderValue)
}

export function clampReaderBpm(bpm: number): number {
  return clamp(Math.round(bpm), READER_BPM_MIN, READER_BPM_MAX)
}
