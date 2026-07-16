import { describe, expect, it, vi } from 'vitest'
import {
  createMeasureWidth,
} from '../readerDisplayScale'

const OLD_CHAR_WIDTH_RATIO = 0.62

describe('measureWidth', () => {
  it('reuses one canvas context and memoizes matching text/font requests', () => {
    const measureText = vi.fn((text: string) => ({ width: text.length * 20 }) as TextMetrics)
    const createContext = vi.fn(() => ({ font: '', measureText }))
    const measureWidth = createMeasureWidth(createContext)
    const font = { fontFamily: 'Georgia, serif', fontWeight: 700, refSize: 100 }

    expect(measureWidth('repeat', font)).toBe(120)
    expect(measureWidth('repeat', font)).toBe(120)

    expect(createContext).toHaveBeenCalledTimes(1)
    expect(measureText).toHaveBeenCalledTimes(1)
  })

  it('falls back to the old ratio when no canvas context is available', () => {
    const measureWidth = createMeasureWidth(() => null)
    const text = 'fallback'

    expect(measureWidth(text, { fontFamily: 'sans-serif', fontWeight: 700, refSize: 100 }))
      .toBe(text.length * 100 * OLD_CHAR_WIDTH_RATIO)
  })
})
