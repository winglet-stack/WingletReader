import { describe, expect, it } from 'vitest'
import {
  BPM_SLIDER_MAX,
  BPM_SLIDER_MIN,
  READER_BPM_MAX,
  READER_BPM_MIN,
  bpmToSlider,
  clampReaderBpm,
  sliderToBpm,
} from '../bpmScale'

describe('bpmScale', () => {
  it('maps slider endpoints to reader BPM endpoints', () => {
    expect(sliderToBpm(BPM_SLIDER_MIN)).toBe(READER_BPM_MIN)
    expect(sliderToBpm(BPM_SLIDER_MAX)).toBe(READER_BPM_MAX)
  })

  it('gives lower BPM values more slider travel', () => {
    expect(sliderToBpm(250)).toBeLessThan(30)
    expect(sliderToBpm(500)).toBeLessThan(100)
    expect(sliderToBpm(750)).toBeGreaterThan(250)
  })

  it('round-trips common BPM values within one step', () => {
    for (const bpm of [20, 60, 120, 250, 400, 650]) {
      expect(Math.abs(sliderToBpm(bpmToSlider(bpm)) - bpm)).toBeLessThanOrEqual(5)
    }
  })

  it('clamps manual BPM input to the reader range', () => {
    expect(clampReaderBpm(0)).toBe(READER_BPM_MIN)
    expect(clampReaderBpm(653)).toBe(READER_BPM_MAX)
    expect(clampReaderBpm(63)).toBe(63)
  })
})
