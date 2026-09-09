import React, { useEffect, useRef, useMemo } from 'react'
import type { WordPosition } from '../../engine/wordHighlight'
import type { TextPagingState } from '../../engine/useTextPaging'
import type { Bookmark, BookmarkKind, TextRecord } from '../../types'
import type { PlainTextContext } from '../../engine/plainTextContext'

function sanitizeDocxHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/\s+on\w+="[^"]*"/gi, '')
    .replace(/\s+on\w+='[^']*'/gi, '')
}

interface PageNodesArgs {
  displayContent: string
  /** Read-only: these come off the shared word index, which owns the array. */
  wordPositions: readonly WordPosition[]
  /** First word index on the Page (inclusive). */
  startWord: number
  /** One past the last word index on the Page (exclusive). */
  endWord: number
  currentWordOffset: number
  goalPickArmed: boolean
  /** wordOffset → bookmark kind for words on this Page (goal wins over normal). */
  bookmarkKindByWord: Map<number, BookmarkKind>
  highlightRef: React.RefObject<HTMLElement>
  onGoalWordPick: (wordOffset: number) => void
}

/**
 * Materialize React nodes for ONLY the `[startWord, endWord)` word range — the
 * current Page (ADR-0025) — not the whole document. Rendering begins at the first
 * word of the Page so leading content from prior Pages is dropped; inter-word text
 * (including paragraph breaks) inside the Page is preserved verbatim. The current
 * word is a `<mark>` carrying `highlightRef`; a bookmarked word gets an inline
 * marker class (goal distinct from normal, decoration only — no interaction,
 * ADR-0025 §4). Word clicks are inert unless the Goal bookmark arm-pick flow is
 * active; then the clicked word reports its whole-text `wordOffset`.
 */
function buildPlainTextPageNodes({
  displayContent,
  wordPositions,
  startWord,
  endWord,
  currentWordOffset,
  goalPickArmed,
  bookmarkKindByWord,
  highlightRef,
  onGoalWordPick,
}: PageNodesArgs): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let cursor = wordPositions[startWord].start

  for (let wordOffset = startWord; wordOffset < endWord; wordOffset++) {
    const position = wordPositions[wordOffset]
    if (position.start > cursor) {
      nodes.push(displayContent.slice(cursor, position.start))
    }

    const isCurrent = wordOffset === currentWordOffset
    const bookmarkKind = bookmarkKindByWord.get(wordOffset)
    const className = [
      'plain-text-word',
      isCurrent ? 'plain-text-word-highlight' : '',
      bookmarkKind ? 'plain-text-word-bookmark' : '',
      bookmarkKind === 'goal' ? 'plain-text-word-bookmark-goal' : '',
    ]
      .filter(Boolean)
      .join(' ')
    const commonProps = {
      className,
      onClick: goalPickArmed ? () => onGoalWordPick(wordOffset) : undefined,
      title: goalPickArmed ? `Set target at word ${wordOffset + 1}` : undefined,
      'data-word-offset': wordOffset,
    }

    nodes.push(
      isCurrent ? (
        <mark key={`word-${wordOffset}`} ref={highlightRef} {...commonProps}>
          {position.text}
        </mark>
      ) : (
        <span key={`word-${wordOffset}`} {...commonProps}>
          {position.text}
        </span>
      )
    )
    cursor = position.end
  }

  return nodes
}

interface Props {
  text: TextRecord
  displayContent: string
  plainTextCtx: PlainTextContext
  paging: TextPagingState
  textViewMode: 'plain' | 'source'
  onTextViewModeChange: (mode: 'plain' | 'source') => void
  showPlainText: boolean
  goalPickArmed?: boolean
  onGoalWordPick?: (wordOffset: number) => void
  plainTextContentRef?: React.MutableRefObject<HTMLPreElement | null>
  /** Bookmarks for the engaged text (ADR-0024) — decorate on-Page words inline. */
  bookmarks?: Bookmark[]
}

export default function TextViewPanel({
  text,
  displayContent,
  plainTextCtx,
  paging,
  textViewMode,
  onTextViewModeChange,
  showPlainText,
  goalPickArmed = false,
  onGoalWordPick = () => {},
  plainTextContentRef,
  bookmarks = [],
}: Props) {
  const highlightRef = useRef<HTMLElement>(null)
  const docxViewRef = useRef<HTMLDivElement>(null)
  const prevShowPlainTextRef = useRef(false)
  const prevTextViewModeRef = useRef<'plain' | 'source'>('plain')

  const hasSourceView = text.source_type === 'docx'

  const {
    wordPositions,
    currentPage,
    currentRange,
    locateRevision,
  } = paging

  // Bookmarked words keyed by wordOffset (ADR-0025 §4). Cheap to rebuild — the list
  // is small — and keyed off the text's bookmarks so it only recomputes when they
  // change. The goal bookmark wins so its word always reads as the goal marker even
  // if a normal bookmark shares the offset.
  const bookmarkKindByWord = useMemo(() => {
    const map = new Map<number, BookmarkKind>()
    for (const bookmark of bookmarks) {
      if (bookmark.kind === 'goal' || !map.has(bookmark.wordOffset)) {
        map.set(bookmark.wordOffset, bookmark.kind)
      }
    }
    return map
  }, [bookmarks])

  const plainTextNodes = useMemo(() => {
    if (!showPlainText || textViewMode !== 'plain') return [displayContent]
    if (wordPositions.length === 0) return [displayContent]

    // Render ONLY the current Page's word range — the rest of the book is never
    // materialized.
    const { startWord, endWord } = currentRange
    return buildPlainTextPageNodes({
      displayContent,
      wordPositions,
      startWord,
      endWord,
      currentWordOffset: plainTextCtx.wordOffset,
      goalPickArmed,
      bookmarkKindByWord,
      highlightRef,
      onGoalWordPick,
    })
  }, [
    displayContent,
    wordPositions,
    currentRange,
    onGoalWordPick,
    plainTextCtx.wordOffset,
    goalPickArmed,
    bookmarkKindByWord,
    showPlainText,
    textViewMode,
  ])

  const scrollHighlightIntoView = () => {
    const el = highlightRef.current
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }

  const scrollToCurrentPosition = () => {
    if (textViewMode === 'plain') {
      scrollHighlightIntoView()
    } else if (text.source_type === 'docx' && docxViewRef.current) {
      const el = docxViewRef.current
      el.scrollTop = el.scrollHeight * plainTextCtx.progress
    }
  }

  useEffect(() => {
    const wasOpen = prevShowPlainTextRef.current
    const modeChanged = prevTextViewModeRef.current !== textViewMode
    prevShowPlainTextRef.current = showPlainText
    prevTextViewModeRef.current = textViewMode

    if (!showPlainText) return
    if (!wasOpen || modeChanged) {
      const t = setTimeout(() => scrollToCurrentPosition(), 50)
      return () => clearTimeout(t)
    }
  }, [showPlainText, textViewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-follow: keep the current word scrolled into view as the playhead moves
  // — within a Page it tracks the highlight, and on a Page flip it lands on the
  // freshly rendered word. Cheap (a scroll, not a full re-render) so it can run
  // per beat; the open / mode-change scroll is handled by the effect above.
  useEffect(() => {
    if (!showPlainText || textViewMode !== 'plain') return
    scrollHighlightIntoView()
  }, [currentPage, plainTextCtx.wordOffset, showPlainText, textViewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showPlainText || locateRevision === 0) return
    scrollToCurrentPosition()
  }, [locateRevision]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={`plain-text-panel${goalPickArmed ? ' plain-text-panel--goal-pick-armed' : ''}`}
      role="region"
      aria-label="Text view"
    >
      {goalPickArmed && (
        <div className="plain-text-goal-pick-banner">
          <span>Click a word to set your target</span>
        </div>
      )}

      {/* Source-format toggle — only for DOCX sources */}
      {hasSourceView && (
        <div className="plain-text-source-toolbar" role="tablist" aria-label="View mode">
          <button
            role="tab"
            aria-selected={textViewMode === 'plain'}
            className={`plain-text-source-tab${textViewMode === 'plain' ? ' plain-text-source-tab--active' : ''}`}
            onClick={() => onTextViewModeChange('plain')}
          >
            Plain Text
          </button>
          <button
            role="tab"
            aria-selected={textViewMode === 'source'}
            className={`plain-text-source-tab${textViewMode === 'source' ? ' plain-text-source-tab--active' : ''}`}
            onClick={() => onTextViewModeChange('source')}
          >
            Formatted
          </button>
        </div>
      )}

      {/* Plain text with word highlight */}
      {(textViewMode === 'plain' || !hasSourceView) && (
        <pre className="plain-text-content" tabIndex={0} ref={plainTextContentRef}>
          {plainTextNodes}
        </pre>
      )}

      {/* DOCX formatted (HTML) view */}
      {textViewMode === 'source' && text.source_type === 'docx' && (
        text.content_html ? (
          <div
            ref={docxViewRef}
            className="docx-view"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: sanitizeDocxHtml(text.content_html) }}
            tabIndex={0}
          />
        ) : (
          <div className="plain-text-source-unavailable">
            <p>Formatted view is not available for this import.</p>
            <p className="plain-text-source-hint">
              Re-import the .docx file to enable the formatted view.
            </p>
          </div>
        )
      )}
    </div>
  )
}
