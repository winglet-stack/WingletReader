import React from 'react'
import type { Settings } from '../types'
import { effectiveLinesCount, resolvedLinesAnchor } from '../../../shared/settings'
import StackPreviewGrid from './StackPreviewGrid'

interface Props {
  settings: Settings
  /**
   * Override the stored `show_chunk_dividers` (SR-3 / ADR-0019). The Settings
   * editor forces dividers off so its preview stays faithful to the neutralized
   * reader, without touching the shared Transmute/RWW-entry and RWW Console
   * previews (which keep the divider control). Omitted → honour the setting.
   */
  showChunkDividers?: boolean
}

export default function ReaderPreview({ settings, showChunkDividers }: Props) {
  const {
    font_size,
    font_family,
    text_color,
    highlight_color,
    highlight_text_color,
    highlight_active,
    viewport_bg_color,
    show_chunk_dividers,
    stacks_visible,
    stack_gap,
    stack_vertical_offset,
    stack_horizontal_offset = 0,
    lines_row_gap,
    words_per_stack,
  } = settings

  return (
    <div className="rcp-preview">
      <div className="rcp-preview-label">Preview</div>
      <StackPreviewGrid
        fontSize={font_size}
        fontFamily={font_family}
        textColor={text_color}
        highlightColor={highlight_color}
        highlightTextColor={highlight_text_color}
        highlightActive={highlight_active}
        bgColor={viewport_bg_color}
        showChunkDividers={showChunkDividers ?? show_chunk_dividers}
        stacksVisible={stacks_visible}
        stackGap={stack_gap}
        stackVerticalOffset={stack_vertical_offset}
        stackHorizontalOffset={stack_horizontal_offset}
        linesCount={effectiveLinesCount(settings)}
        linesAnchor={resolvedLinesAnchor(settings)}
        linesRowGap={lines_row_gap}
        wordsPerStack={words_per_stack}
        offsetScale={0.25}
        maxStacks={4}
        maxRows={3}
        stageClassName="rcp-preview-stage"
      />
    </div>
  )
}
