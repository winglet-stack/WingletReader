import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import targetDarkSrc from '../../assets/reader-buttons/target-dark.png'
import targetLightSrc from '../../assets/reader-buttons/target-light.png'
import {
  bookmarkLabelForDraft,
  bookmarkSnippetAtWordOffset,
  bookmarkWordOffsetAtIndex,
  displayContentForBookmark,
  savedReadingPositionWordOffset,
} from '../../engine/bookmarkDraft'
import { resolveWordsToStackIndex } from '../../engine/readerSession'
import type { Bookmark, BookmarkKind, TextRecord, WordStack } from '../../types'
import BookmarkList from '../bookmarks/BookmarkList'
import Segmented from '../settings/instruments/Segmented'
import ReaderButtonIcon from './ReaderButtonIcon'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  text: TextRecord
  currentIndex: number
  stacks: WordStack[]
  goalPickDraft?: {
    wordOffset: number | null
    customLabel: string
  } | null
  goalPickArmed?: boolean
  plainTextContentRef?: React.MutableRefObject<HTMLPreElement | null>
  onArmGoalPick?: (customLabel: string) => void
  onCancelGoalPick?: () => void
  onSeek: (index: number) => void
  onBookmarksChange?: (bookmarks: Bookmark[]) => void
  onGoalBookmarkChange?: (bookmark: Bookmark | null) => void
  consumedBookmarkId?: number | null
  /** When false, only the settings gear shows in the footer (in-frame Library browse). */
  hidden?: boolean
}

const BOOKMARK_KIND_OPTIONS: ReadonlyArray<{ value: BookmarkKind; label: string }> = [
  { value: 'normal', label: 'Bookmark' },
  { value: 'goal', label: 'Target' },
]

const GOAL_FORWARD_ERROR = 'Target must be ahead of your saved reading position.'
const FULL_POPOVER_WIDTH_FALLBACK = 300

export default function BookmarkPopover({
  open,
  onOpenChange,
  text,
  currentIndex,
  stacks,
  goalPickDraft = null,
  goalPickArmed = false,
  plainTextContentRef,
  onArmGoalPick = () => {},
  onCancelGoalPick = () => {},
  onSeek,
  onBookmarksChange,
  onGoalBookmarkChange,
  consumedBookmarkId = null,
  hidden = false,
}: Props) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [kind, setKind] = useState<BookmarkKind>('normal')
  const [label, setLabel] = useState('')
  const [labelEdited, setLabelEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collapseGoalPickPopover, setCollapseGoalPickPopover] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)
  const fullPopoverWidthRef = useRef(FULL_POPOVER_WIDTH_FALLBACK)
  const textId = text.id

  const currentWordOffset = useMemo(
    () => bookmarkWordOffsetAtIndex(stacks, currentIndex),
    [stacks, currentIndex]
  )
  const displayContent = useMemo(() => displayContentForBookmark(text), [text])
  const pickedGoalWordOffset = goalPickDraft?.wordOffset ?? null
  const pickedSnippet = useMemo(
    () =>
      pickedGoalWordOffset == null
        ? ''
        : bookmarkSnippetAtWordOffset(displayContent, pickedGoalWordOffset),
    [displayContent, pickedGoalWordOffset]
  )
  const currentSnippet = useMemo(
    () => bookmarkSnippetAtWordOffset(displayContent, currentWordOffset),
    [displayContent, currentWordOffset]
  )
  const selectedPositionDisabled = textId == null || stacks.length === 0 || saving
  const currentPositionDisabled = textId == null || stacks.length === 0 || saving
  const goalAwaitingPick = kind === 'goal' && goalPickArmed && pickedGoalWordOffset == null
  const goalSaveDisabled =
    selectedPositionDisabled ||
    pickedGoalWordOffset == null ||
    error === GOAL_FORWARD_ERROR
  const activeSnippet = kind === 'goal' && pickedGoalWordOffset != null
    ? pickedSnippet
    : currentSnippet
  const totalWords = text.word_count ?? stacks.reduce((sum, stack) => sum + stack.words.length, 0)
  const pickedGoalPercent =
    pickedGoalWordOffset == null || totalWords <= 0
      ? null
      : Math.round(((pickedGoalWordOffset + 1) / totalWords) * 100)
  const currentPositionLabel =
    totalWords > 0
      ? `${Math.round((currentWordOffset / totalWords) * 100)}%`
      : `word ${currentWordOffset.toLocaleString()}`
  const positionDetail = kind === 'normal'
    ? `Current position: ${currentPositionLabel}`
    : pickedGoalWordOffset == null
      ? `Target position: pick a word in text view; current position: ${currentPositionLabel}`
      : `Target position: word ${(pickedGoalWordOffset + 1).toLocaleString()} of ${totalWords.toLocaleString()} (${pickedGoalPercent}%); current position: ${currentPositionLabel}`

  const validateGoalForwardRule = useCallback(async (candidateWordOffset: number) => {
    if (kind !== 'goal' || textId == null) return true

    const savedPosition =
      typeof window.api.db.getReadingPosition === 'function'
        ? await window.api.db.getReadingPosition(textId)
        : null
    const savedWordOffset = savedReadingPositionWordOffset(
      stacks,
      savedPosition?.stackIndex
    )
    if (candidateWordOffset <= savedWordOffset) {
      setError(GOAL_FORWARD_ERROR)
      return false
    }
    return true
  }, [kind, stacks, textId])

  const createBookmark = useCallback(
    async (candidateWordOffset: number, candidateSnippet: string) => {
      if (textId == null || stacks.length === 0 || saving) return

      setSaving(true)
      setError(null)
      try {
        if (typeof window.api.db.saveBookmark !== 'function') {
          throw new Error('Bookmark API unavailable')
        }
        const goalIsValid = await validateGoalForwardRule(candidateWordOffset)
        if (!goalIsValid) return

        const bookmark = await window.api.db.saveBookmark(textId, {
          kind,
          wordOffset: candidateWordOffset,
          label: bookmarkLabelForDraft(label, candidateSnippet, candidateWordOffset),
        })
        setBookmarks((current) => (
          bookmark.kind === 'goal'
            ? [...current.filter((entry) => entry.kind !== 'goal'), bookmark]
            : [...current, bookmark]
        ))
        onOpenChange(false)
      } catch {
        setError('Could not save bookmark.')
      } finally {
        setSaving(false)
      }
    },
    [
      kind,
      label,
      onOpenChange,
      saving,
      stacks.length,
      textId,
      validateGoalForwardRule,
    ]
  )
  const hasBookmarks = bookmarks.length > 0
  const goalBookmark = useMemo(
    () => bookmarks.find((bookmark) => bookmark.kind === 'goal') ?? null,
    [bookmarks]
  )
  const activeBookmarks = useMemo(
    () => bookmarks.filter((bookmark) => bookmark.kind === kind),
    [bookmarks, kind]
  )
  useEffect(() => {
    onBookmarksChange?.(bookmarks)
  }, [bookmarks, onBookmarksChange])

  useEffect(() => {
    onGoalBookmarkChange?.(goalBookmark)
  }, [goalBookmark, onGoalBookmarkChange])

  useEffect(() => {
    if (consumedBookmarkId == null) return
    setBookmarks((current) => current.filter((bookmark) => bookmark.id !== consumedBookmarkId))
  }, [consumedBookmarkId])

  const loadBookmarks = useCallback(() => {
    if (textId == null) {
      setBookmarks([])
      return
    }
    if (typeof window.api.db.getBookmarks !== 'function') {
      setBookmarks([])
      return
    }
    setBookmarks([])
    window.api.db
      .getBookmarks(textId)
      .then(setBookmarks)
      .catch(() => setBookmarks([]))
  }, [textId])

  useEffect(() => {
    loadBookmarks()
  }, [loadBookmarks])

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }

    const openedNow = !wasOpenRef.current
    wasOpenRef.current = true

    if (openedNow) {
      const nextKind = goalPickArmed || pickedGoalWordOffset != null ? 'goal' : 'normal'
      const customLabel = goalPickDraft?.customLabel ?? ''
      setKind(nextKind)
      // Leave the label empty; the snippet shows as a greyed-out placeholder suggestion.
      setLabel(nextKind === 'goal' ? customLabel : '')
      setLabelEdited(customLabel.trim().length > 0)
      setError(null)
      return
    }

    if (pickedGoalWordOffset != null) {
      const customLabel = goalPickDraft?.customLabel ?? ''
      setKind('goal')
      setLabel(customLabel)
      setLabelEdited(customLabel.trim().length > 0)
      setError(null)
    }
  }, [goalPickArmed, goalPickDraft?.customLabel, open, pickedGoalWordOffset])

  const handleKindChange = useCallback((nextKind: BookmarkKind) => {
    setKind(nextKind)
    const customLabel = goalPickDraft?.customLabel ?? ''
    setLabel(nextKind === 'goal' ? customLabel : '')
    setLabelEdited(customLabel.trim().length > 0)
    setError(null)
  }, [goalPickDraft?.customLabel])

  useLayoutEffect(() => {
    const measure = () => {
      if (!open || !goalAwaitingPick) {
        setCollapseGoalPickPopover(false)
        return
      }

      const textContentEl = plainTextContentRef?.current
      const wrapEl = wrapRef.current
      if (!textContentEl || !wrapEl) {
        setCollapseGoalPickPopover(false)
        return
      }

      const livePopoverWidth = popoverRef.current?.getBoundingClientRect().width ?? 0
      if (!collapseGoalPickPopover && livePopoverWidth > 0) {
        fullPopoverWidthRef.current = livePopoverWidth
      }

      const textRect = textContentEl.getBoundingClientRect()
      const wrapRect = wrapEl.getBoundingClientRect()
      const paddingRight = Number.parseFloat(window.getComputedStyle(textContentEl).paddingRight) || 0
      const glyphBoxRight = textRect.right - paddingRight
      const fullPopoverLeft = wrapRect.right - fullPopoverWidthRef.current

      setCollapseGoalPickPopover(fullPopoverLeft < glyphBoxRight)
    }

    measure()

    if (!open || !goalAwaitingPick) return

    const observedElements: Element[] = []
    if (plainTextContentRef?.current) observedElements.push(plainTextContentRef.current)
    if (wrapRef.current) observedElements.push(wrapRef.current)
    if (popoverRef.current) observedElements.push(popoverRef.current)
    const ro = typeof ResizeObserver === 'function'
      ? new ResizeObserver(measure)
      : null
    observedElements.forEach((el) => ro?.observe(el))
    window.addEventListener('resize', measure)

    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [collapseGoalPickPopover, goalAwaitingPick, open, plainTextContentRef])

  useEffect(() => {
    if (!open || kind !== 'goal' || pickedGoalWordOffset == null) return

    let active = true
    setError(null)
    validateGoalForwardRule(pickedGoalWordOffset)
      .then((valid) => {
        if (active && valid) setError(null)
      })
      .catch(() => {
        if (active) setError('Could not validate goal position.')
      })
    return () => { active = false }
  }, [kind, open, pickedGoalWordOffset, validateGoalForwardRule])

  // Close bookmark popover on outside click; Escape is owned by Reader's cascade.
  useEffect(() => {
    if (!open) return
    const handleMouseDown = (e: MouseEvent) => {
      if (goalPickArmed) return
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        onOpenChange(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [goalPickArmed, open, onOpenChange])

  const handleSelectBookmark = useCallback((bookmark: Bookmark) => {
    onSeek(resolveWordsToStackIndex(bookmark.wordOffset, stacks))
    onOpenChange(false)
  }, [onSeek, onOpenChange, stacks])

  const handleDeleteBookmark = useCallback(async (bookmark: Bookmark) => {
    if (deletingId !== null) return

    setDeletingId(bookmark.id)
    setError(null)
    try {
      if (typeof window.api.db.deleteBookmark !== 'function') {
        throw new Error('Bookmark API unavailable')
      }
      await window.api.db.deleteBookmark(bookmark.id)
      setBookmarks((current) => current.filter((entry) => entry.id !== bookmark.id))
    } catch {
      setError('Could not delete bookmark.')
    } finally {
      setDeletingId(null)
    }
  }, [deletingId])

  if (hidden) return null

  const popoverClassName = [
    'bookmark-popover',
    collapseGoalPickPopover ? 'bookmark-popover--collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="bookmark-popover-wrap" ref={wrapRef}>
      {open && (
        <div className={popoverClassName} ref={popoverRef} role="dialog" aria-label="Bookmarks">
          {collapseGoalPickPopover ? (
            <div className="bookmark-popover-collapsed-strip">
              <button
                className="bookmark-popover-set-btn bookmark-popover-set-btn--danger"
                onClick={onCancelGoalPick}
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <div className="bookmark-popover-header">
                <span>Bookmarks</span>
                <span className="bookmark-popover-count">
                  {hasBookmarks ? `${bookmarks.length} saved` : 'None saved'}
                </span>
              </div>

              <div className="bookmark-popover-body">
                <div className="bookmark-popover-tabs">
                  <Segmented
                    label="Bookmark category"
                    value={kind}
                    options={BOOKMARK_KIND_OPTIONS}
                    onChange={handleKindChange}
                  />
                </div>

                <BookmarkList
                  bookmarks={activeBookmarks}
                  totalWords={totalWords}
                  emptyLabel={kind === 'goal' ? 'No target set yet.' : 'No bookmarks yet.'}
                  onSelect={handleSelectBookmark}
                  onDelete={handleDeleteBookmark}
                  deletingId={deletingId}
                />

                <div className="bookmark-popover-field">
                  <label className="bookmark-popover-label" htmlFor="bookmark-label-input">
                    Label
                  </label>
                  <input
                    id="bookmark-label-input"
                    className="bookmark-popover-input"
                    value={label}
                    onChange={(e) => {
                      setLabel(e.target.value)
                      setLabelEdited(true)
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      if (kind === 'goal') {
                        if (pickedGoalWordOffset == null || goalSaveDisabled) return
                        void createBookmark(pickedGoalWordOffset, pickedSnippet)
                        return
                      }
                      void createBookmark(currentWordOffset, currentSnippet)
                    }}
                    placeholder={activeSnippet || 'Optional label'}
                    autoFocus
                  />
                </div>
                <div className="bookmark-popover-detail">
                  {positionDetail}
                </div>

                {error && (
                  <div className="bookmark-popover-error" role="alert">
                    <span>{error}</span>
                    {error === GOAL_FORWARD_ERROR && (
                      <button
                        className="bookmark-popover-inline-action"
                        onClick={() => onArmGoalPick(labelEdited ? label : '')}
                      >
                        Pick another word
                      </button>
                    )}
                  </div>
                )}

                <div className="bookmark-popover-actions">
                  {kind === 'normal' ? (
                    <button
                      className="bookmark-popover-set-btn"
                      onClick={() => void createBookmark(currentWordOffset, currentSnippet)}
                      disabled={currentPositionDisabled}
                    >
                      {saving ? 'Saving...' : 'Set Bookmark'}
                    </button>
                  ) : (
                    <span className="bookmark-popover-selected-action">
                      <button
                        className={[
                          'bookmark-popover-set-btn',
                          goalAwaitingPick ? 'bookmark-popover-set-btn--danger' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => {
                          if (goalAwaitingPick) {
                            onCancelGoalPick()
                            return
                          }
                          if (pickedGoalWordOffset == null) {
                            setError(null)
                            onArmGoalPick(labelEdited ? label : '')
                            return
                          }
                          void createBookmark(pickedGoalWordOffset, pickedSnippet)
                        }}
                        disabled={goalAwaitingPick ? false : pickedGoalWordOffset == null ? selectedPositionDisabled : goalSaveDisabled}
                      >
                        {saving
                          ? 'Saving...'
                          : goalAwaitingPick
                            ? 'Cancel'
                            : pickedGoalWordOffset == null
                              ? 'Set Target'
                            : goalBookmark
                              ? 'Replace target'
                              : 'Save target'}
                      </button>
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <button
        className={[
          'reader-utility-btn',
          'reader-utility-btn--bookmark',
          open ? 'reader-utility-btn--open' : '',
          hasBookmarks ? 'reader-utility-btn--bookmark-has-items' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => onOpenChange(!open)}
        title={hasBookmarks ? 'Bookmarks saved for this text' : 'Add bookmark'}
        aria-label={hasBookmarks ? 'Open bookmarks, saved bookmarks exist' : 'Open bookmarks'}
        aria-expanded={open}
        disabled={textId == null || stacks.length === 0}
      >
        <ReaderButtonIcon darkSrc={targetDarkSrc} lightSrc={targetLightSrc} alt="Bookmarks" />
      </button>
    </div>
  )
}
