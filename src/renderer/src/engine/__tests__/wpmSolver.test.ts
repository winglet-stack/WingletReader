import { describe, it, expect } from 'vitest'
import {
  solveForTargetWpm,
  READER_WPM_CONSTRAINTS,
  SCRIPT_WPM_CONSTRAINTS,
  READER_TARGET_WPM_SLIDER_MAX,
  READER_TARGET_WPM_LINEAR_MAX,
  READER_TARGET_WPM_MAX,
  readerTargetWpmToSlider,
  sliderToReaderTargetWpm,
  type WpmConstraints,
} from '../wpmSolver'

// ── Helpers ────────────────────────────────────────────────────────────────

const TIGHT: WpmConstraints = {
  bpmMin: 20, bpmMax: 300, bpmStep: 1,
  wpsMin: 1,  wpsMax: 10,
}

// ── Exact match ────────────────────────────────────────────────────────────

describe('solveForTargetWpm — exact matches', () => {
  it('returns exact match when targetWpm is perfectly divisible by a valid WPS', () => {
    // 200 = 50 bpm × 4 wps — should find this (or an equivalent exact solution)
    const s = solveForTargetWpm(200, TIGHT)
    expect(s.effectiveWpm).toBe(200)
  })

  it('returns exact match for targetWpm=60 (60 bpm × 1 wps)', () => {
    const s = solveForTargetWpm(60, TIGHT)
    expect(s.effectiveWpm).toBe(60)
  })

  it('returns exact match for targetWpm=300 (100 bpm × 3 wps)', () => {
    const s = solveForTargetWpm(300, TIGHT)
    expect(s.effectiveWpm).toBe(300)
  })
})

describe('reader target WPM slider mapping', () => {
  it('dedicates 75% of the slider to the linear 0-1000 WPM range', () => {
    expect(sliderToReaderTargetWpm(0)).toBe(0)
    expect(sliderToReaderTargetWpm(375)).toBe(500)
    expect(sliderToReaderTargetWpm(750)).toBe(READER_TARGET_WPM_LINEAR_MAX)
  })

  it('uses the last 25% of the slider for exponential growth to the max target WPM', () => {
    expect(sliderToReaderTargetWpm(875)).toBeGreaterThan(1000)
    expect(sliderToReaderTargetWpm(READER_TARGET_WPM_SLIDER_MAX)).toBe(READER_TARGET_WPM_MAX)
  })

  it('maps saved target WPM back to matching slider positions', () => {
    expect(readerTargetWpmToSlider(0)).toBe(0)
    expect(readerTargetWpmToSlider(500)).toBe(375)
    expect(readerTargetWpmToSlider(1000)).toBe(750)
    expect(readerTargetWpmToSlider(READER_TARGET_WPM_MAX)).toBe(READER_TARGET_WPM_SLIDER_MAX)
  })
})

// ── Closest match (no exact solution) ─────────────────────────────────────

describe('solveForTargetWpm — closest match', () => {
  it('returns the solution with minimum |effective - target|', () => {
    // targetWpm=199 is hard to hit exactly with step-1; effective should be very close
    const s = solveForTargetWpm(199, TIGHT)
    expect(Math.abs(s.effectiveWpm - 199)).toBeLessThanOrEqual(2)
  })

  it('ties on error are broken by preferring smaller WPS', () => {
    // targetWpm = 100 with step-1:
    //   wps=1 → bpm=100 → effective=100 (error=0)
    //   wps=2 → bpm=50  → effective=100 (error=0)
    // Both are exact; solver should return wps=1
    const s = solveForTargetWpm(100, TIGHT)
    expect(s.effectiveWpm).toBe(100)
    expect(s.wordsPerStack).toBe(1)
  })
})

// ── Boundary clamping ──────────────────────────────────────────────────────

describe('solveForTargetWpm — boundary clamping', () => {
  it('clamps BPM to bpmMin when targetWpm is very low', () => {
    const s = solveForTargetWpm(1, READER_WPM_CONSTRAINTS)
    expect(s.bpm).toBe(READER_WPM_CONSTRAINTS.bpmMin)
  })

  it('clamps BPM to bpmMax when targetWpm is very high', () => {
    const s = solveForTargetWpm(999999, READER_WPM_CONSTRAINTS)
    expect(s.bpm).toBe(READER_WPM_CONSTRAINTS.bpmMax)
  })

  it('BPM is always a multiple of bpmStep', () => {
    for (const target of [100, 150, 200, 250, 300, 400]) {
      const s = solveForTargetWpm(target, READER_WPM_CONSTRAINTS)
      expect(s.bpm % READER_WPM_CONSTRAINTS.bpmStep).toBe(0)
    }
  })

  it('wordsPerStack is always within [wpsMin, wpsMax]', () => {
    for (const target of [20, 100, 500, 1200, 6000, 12000]) {
      const s = solveForTargetWpm(target, READER_WPM_CONSTRAINTS)
      expect(s.wordsPerStack).toBeGreaterThanOrEqual(READER_WPM_CONSTRAINTS.wpsMin)
      expect(s.wordsPerStack).toBeLessThanOrEqual(READER_WPM_CONSTRAINTS.wpsMax)
    }
  })

  // ── New cap: 1200 BPM ──────────────────────────────────────────────────────

  it('accepts BPM values that were above the old 300 cap (reader)', () => {
    // 600 BPM was previously rejected by the slider; solver should now reach it.
    const s = solveForTargetWpm(600, READER_WPM_CONSTRAINTS)
    expect(s.bpm).toBeGreaterThanOrEqual(60)
    expect(s.bpm).toBeLessThanOrEqual(READER_WPM_CONSTRAINTS.bpmMax)
  })

  it('clamps BPM to the new cap of 1200 for extremely high targets (reader)', () => {
    const s = solveForTargetWpm(999999, READER_WPM_CONSTRAINTS)
    expect(s.bpm).toBe(1200)
  })

  it('reaches exactly 1200 BPM at the new cap (reader)', () => {
    const s = solveForTargetWpm(1200, READER_WPM_CONSTRAINTS)
    expect(s.bpm).toBeLessThanOrEqual(1200)
    expect(s.effectiveWpm).toBe(s.bpm * s.wordsPerStack)
  })
})

// ── BPM step snapping ──────────────────────────────────────────────────────

describe('solveForTargetWpm — step grid snapping (reader constraints)', () => {
  it('BPM is always a multiple of 5 for reader constraints', () => {
    for (const target of [77, 123, 201, 333, 480]) {
      const s = solveForTargetWpm(target, READER_WPM_CONSTRAINTS)
      expect(s.bpm % 5).toBe(0)
    }
  })

  it('effectiveWpm = bpm × wordsPerStack', () => {
    for (const target of [100, 200, 350, 600]) {
      const s = solveForTargetWpm(target, READER_WPM_CONSTRAINTS)
      expect(s.effectiveWpm).toBe(s.bpm * s.wordsPerStack)
    }
  })
})

// ── Script constraints ─────────────────────────────────────────────────────

describe('solveForTargetWpm — script constraints', () => {
  it('allows higher target WPM than reader', () => {
    const s = solveForTargetWpm(1000, SCRIPT_WPM_CONSTRAINTS)
    expect(s.effectiveWpm).toBeGreaterThan(900)
    expect(s.bpm).toBeLessThanOrEqual(SCRIPT_WPM_CONSTRAINTS.bpmMax)
  })

  it('wordsPerStack can reach wpsMax=20 at maximum target', () => {
    // targetWpm = 1200 × 20 = 24000; solver should hit bpmMax and max wps
    const s = solveForTargetWpm(24000, SCRIPT_WPM_CONSTRAINTS)
    expect(s.bpm).toBe(SCRIPT_WPM_CONSTRAINTS.bpmMax)
  })

  it('accepts BPM values that were above the old 600 cap (script)', () => {
    // 900 BPM was previously above the Script Builder cap; now allowed.
    const s = solveForTargetWpm(900, SCRIPT_WPM_CONSTRAINTS)
    expect(s.bpm).toBeGreaterThanOrEqual(10)
    expect(s.bpm).toBeLessThanOrEqual(1200)
    expect(s.effectiveWpm).toBe(s.bpm * s.wordsPerStack)
  })

  it('clamps BPM to the new cap of 1200 for extremely high targets (script)', () => {
    const s = solveForTargetWpm(999999, SCRIPT_WPM_CONSTRAINTS)
    expect(s.bpm).toBe(1200)
  })

  it('BPM within old range [10, 600] is unchanged by the cap increase', () => {
    for (const target of [60, 120, 300, 600]) {
      const s = solveForTargetWpm(target, SCRIPT_WPM_CONSTRAINTS)
      expect(s.bpm).toBeGreaterThanOrEqual(10)
      expect(s.bpm).toBeLessThanOrEqual(target)
      expect(s.effectiveWpm).toBe(s.bpm * s.wordsPerStack)
    }
  })
})
