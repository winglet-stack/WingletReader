import { READER_MIN_VISIBLE_FONT_SIZE } from '../../../shared/readerDisplayScale'

const CHAR_WIDTH_RATIO = 0.62
const WIDTH_MEASURE_REF_SIZE = 100
const DEFAULT_FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
const DEFAULT_FONT_WEIGHT = 700

export interface MeasureWidthFont {
  fontFamily?: string
  fontWeight?: string | number
  refSize?: number
}

export type ReaderTextMeasurer = (text: string, font: MeasureWidthFont) => number

type MeasureTextContext = Pick<CanvasRenderingContext2D, 'font' | 'measureText'>

function safeRefSize(refSize: number | undefined): number {
  return Number.isFinite(refSize) && refSize !== undefined && refSize > 0
    ? refSize
    : WIDTH_MEASURE_REF_SIZE
}

function safeFont(font: MeasureWidthFont): Required<MeasureWidthFont> {
  return {
    fontFamily: font.fontFamily?.trim() || DEFAULT_FONT_FAMILY,
    fontWeight: font.fontWeight ?? DEFAULT_FONT_WEIGHT,
    refSize: safeRefSize(font.refSize),
  }
}

function fallbackMeasuredWidth(text: string, refSize: number): number {
  return Math.max(1, text.length) * refSize * CHAR_WIDTH_RATIO
}

function fontSpec(font: Required<MeasureWidthFont>): string {
  return `${font.fontWeight} ${font.refSize}px ${font.fontFamily}`
}

function createDefaultCanvasTextContext(): MeasureTextContext | null {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(1, 1)
    return canvas.getContext('2d')
  }

  if (typeof document !== 'undefined') {
    return document.createElement('canvas').getContext('2d')
  }

  return null
}

export function createMeasureWidth(
  createContext: () => MeasureTextContext | null = createDefaultCanvasTextContext
): ReaderTextMeasurer {
  let context: MeasureTextContext | null = null
  let contextInitialized = false
  const cache = new Map<string, number>()

  return (text: string, inputFont: MeasureWidthFont): number => {
    const font = safeFont(inputFont)
    const key = `${text}\u0000${font.fontFamily}\u0000${font.fontWeight}\u0000${font.refSize}`
    const cached = cache.get(key)
    if (cached !== undefined) return cached

    let width = fallbackMeasuredWidth(text, font.refSize)

    try {
      if (!contextInitialized) {
        context = createContext()
        contextInitialized = true
      }

      if (context) {
        context.font = fontSpec(font)
        const measured = context.measureText(text).width
        if (Number.isFinite(measured) && measured > 0) {
          width = measured
        }
      }
    } catch {
      width = fallbackMeasuredWidth(text, font.refSize)
    }

    cache.set(key, width)
    return width
  }
}

export { READER_MIN_VISIBLE_FONT_SIZE }
