/**
 * Reader stage CSS custom-property builder (RO-7 M4).
 * Pure mapping from color/font settings to the --rd-* variable object shared by
 * the Reader stage and the settings StackPreviewGrid. Empty/undefined values
 * leave the variable unset so the stylesheet defaults apply.
 */

export interface ReaderCssVarInput {
  highlightColor?: string
  stageBgColor?: string
  textColor?: string
  fontFamily?: string
  /** Pass the already-resolved value (resolveHighlightTextColor); null = unset. */
  highlightTextColor?: string | null
}

export function buildReaderCssVars(input: ReaderCssVarInput): Record<string, string> {
  return {
    ...(input.highlightColor ? { '--rd-highlight': input.highlightColor } : {}),
    ...(input.stageBgColor ? { '--rd-stage-bg': input.stageBgColor } : {}),
    ...(input.textColor ? { '--rd-text': input.textColor } : {}),
    ...(input.fontFamily ? { '--rd-font': input.fontFamily } : {}),
    ...(input.highlightTextColor ? { '--rd-highlight-text': input.highlightTextColor } : {}),
  }
}
