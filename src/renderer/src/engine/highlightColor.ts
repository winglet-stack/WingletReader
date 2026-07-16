/** Parses a 6-digit hex color to RGB components. Returns null for invalid input. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

function linearize(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** WCAG 2.1 relative luminance (0–1) for an sRGB color. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

/** WCAG contrast ratio between two luminance values. */
export function contrastRatio(lum1: number, lum2: number): number {
  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Returns '#000000' or '#ffffff', whichever gives higher WCAG contrast
 * against the given hex background color. Falls back to '#000000' on invalid input.
 */
export function autoTextColor(bgHex: string): '#000000' | '#ffffff' {
  const rgb = hexToRgb(bgHex)
  if (!rgb) return '#000000'
  const bgLum = relativeLuminance(rgb.r, rgb.g, rgb.b)
  const whiteContrast = contrastRatio(bgLum, 1.0)
  const blackContrast = contrastRatio(bgLum, 0.0)
  return whiteContrast >= blackContrast ? '#ffffff' : '#000000'
}

/**
 * Resolves the CSS color to inject as --rd-highlight-text.
 *
 * - If customTextColor is a valid hex: return it (user override).
 * - If highlightColor is set: auto-pick black or white via WCAG contrast.
 * - Otherwise: return null — let existing CSS fallback (var(--reader-bg)) apply.
 */
export function resolveHighlightTextColor(
  highlightColor: string,
  customTextColor: string,
): string | null {
  if (customTextColor) {
    return hexToRgb(customTextColor) ? customTextColor : null
  }
  if (highlightColor) {
    return autoTextColor(highlightColor)
  }
  return null
}
