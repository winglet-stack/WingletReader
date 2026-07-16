import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react'
import { useLibrary } from '../contexts/LibraryContext'
import { useSettings } from '../contexts/SettingsContext'
import { useReader } from '../contexts/ReaderContext'
import logoModernSrc from '../assets/logo-modern.png'
import libraryToggleDarkSrc from '../assets/reader-tiles/library-toggle-dark.png'
import libraryToggleLightSrc from '../assets/reader-tiles/library-toggle-light.png'
import { usePlayback } from '../hooks/usePlayback'
import { useReadingSessionLifecycle } from '../hooks/useReadingSessionLifecycle'
import { computePlainTextContext } from '../engine/plainTextContext'
import { useTextPaging } from '../engine/useTextPaging'
import { computeHighlightedSlots } from '../engine/highlightingEngine'
import { autoTextColor, resolveHighlightTextColor } from '../engine/highlightColor'
import { buildReaderCssVars } from '../engine/readerCssVars'
import { READER_MIN_VISIBLE_FONT_SIZE, createMeasureWidth } from '../engine/readerDisplayScale'
import { solveReaderLayout, type SolveReaderLayoutResult } from '../engine/readerLayoutSolver'
import { wordOffsetAtIndex, computeMinutesLeft, resolveWordsToStackIndex } from '../engine/readerSession'
import { resolveReaderKeyAction } from '../engine/readerKeymap'
import {
  isStageLeftHalf,
  mouseEventMatchesBinding,
  resolveStageMouseClick,
  tapToReadStageMouseAction,
} from '../engine/readerBindings'
import { deriveBlockPosition, panningBarRevealUpToSlot, nextRevealState, buildDisplayRows, buildGridTemplateColumns } from '../engine/stackLayout'
import type { RevealState } from '../engine/stackLayout'
import type { Bookmark, Settings } from '../types'
import BookmarkPopover from './reader/BookmarkPopover'
import QuickSettingsPopover from './reader/QuickSettingsPopover'
import ReaderTopbar from './reader/ReaderTopbar'
import ReaderKeyhints from './reader/ReaderKeyhints'
import TextViewPanel from './reader/TextViewPanel'
import StackGrid from './reader/StackGrid'
import ReaderControls from './reader/ReaderControls'
import ReaderButtonIcon from './reader/ReaderButtonIcon'
import { TextConsoleLocateButton, TextConsolePager } from './reader/TextConsoleControls'
import ReaderScrubber from './reader/ReaderScrubber'
import { ReaderCountdown, ReaderIdle } from './reader/StageOverlays'
import ReaderConfigDrawer from './reader/ReaderConfigDrawer'
import ReaderLibraryBrowse from './reader/ReaderLibraryBrowse'
import SessionDialog from './reader/SessionDialog'


interface Props {
  onBack: () => void
  onExitToLibrary: () => void
  /** Label used for the top-left exit button. */
  backLabel?: string
  /** Disabled for TemporaryReaderApp so its existing completion/close path stays unchanged. */
  sessionEndEnabled?: boolean
  /** Standard Reader only; TemporaryReaderApp/RWW must not expose library browse. */
  libraryBrowseEnabled?: boolean
}

function ReaderBrowseToggle({
  browsing,
  onToggleBrowse,
}: {
  browsing: boolean
  onToggleBrowse: () => void
}) {
  const label = browsing ? 'Back to reading' : 'Browse library'

  return (
    <button
      type="button"
      className={`reader-browse-btn${browsing ? ' reader-browse-btn--active' : ''}`}
      onClick={onToggleBrowse}
      aria-pressed={browsing}
      aria-label={label}
      title={label}
    >
      <ReaderButtonIcon darkSrc={libraryToggleDarkSrc} lightSrc={libraryToggleLightSrc} alt={label} />
    </button>
  )
}


export default function Reader({
  onBack,
  onExitToLibrary,
  backLabel = 'Library',
  sessionEndEnabled = true,
  libraryBrowseEnabled = true,
}: Props) {
  const { activeText } = useLibrary()
  const { settings, saveSettings: onSettingsChange } = useSettings()
  const {
    activeSegmentCtx: segmentCtx,
    readerRereReadEnd: rereReadEndIndex,
    readerResumeFrom: resumeFromIndex,
    readerConfigDrawerOpen,
    setReaderConfigDrawerOpen,
    refreshResumeCandidate,
    handleResumeHandled: onResumeHandled,
    handleReadingComplete: onReadingComplete,
  } = useReader()
  const text = activeText!

  const logoSrc = logoModernSrc
  const content = text?.content ?? ''
  const displayContent = (text?.content_display ?? content).replace(/\f/g, '\n\n')

  // Live settings shadow — initialized once from props, mutated by the quick-settings panel.
  // Passed to usePlayback so changes take effect immediately without a full re-mount.
  const [liveSettings, setLiveSettings] = useState<Settings>(settings)

  const {
    stacks,
    currentIndex,
    state,
    wpm,
    progress,
    play,
    playFrom,
    pause,
    resume,
    stop,
    pauseAndHold,
    discardToStart,
    restart,
    rewind,
    seekTo,
    naturalEndRevision,
    stepForward,
  } = usePlayback({
    text: content,
    settings: liveSettings,
    pauseOnNaturalEnd: sessionEndEnabled,
  })

  const stageRef = useRef<HTMLDivElement | null>(null)
  const [stageNode, setStageNode] = useState<HTMLDivElement | null>(null)
  // Tracks the maximum revealed slot index for the current row — prevents content
  // from disappearing when the highlight mode is changed mid-row.
  const revealStateRef = useRef<RevealState>({ lineKey: -1, revealUpTo: 0 })
  const [tapHoverSide, setTapHoverSide] = useState<'left' | 'right' | null>(null)

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showFsControls, setShowFsControls] = useState(false)
  const [stageDims, setStageDims] = useState({ width: 0, height: 0 })
  const [showPlainText, setShowPlainText] = useState(false)
  const [textViewMode, setTextViewMode] = useState<'plain' | 'source'>('plain')
  const [goalPickArmed, setGoalPickArmed] = useState(false)
  const [goalPickDraft, setGoalPickDraft] = useState<{ wordOffset: number | null; customLabel: string } | null>(null)
  const [returnFromSessionTargetPick, setReturnFromSessionTargetPick] = useState(false)
  const [browsing, setBrowsing] = useState(false)
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [goalBookmark, setGoalBookmark] = useState<Bookmark | null>(null)
  const [consumedGoalBookmarkId, setConsumedGoalBookmarkId] = useState<number | null>(null)
  const [manualSeekRevision, setManualSeekRevision] = useState(0)
  const [textLocateRevision, setTextLocateRevision] = useState(0)
  const [fontReadyRevision, setFontReadyRevision] = useState(0)
  const plainTextContentRef = useRef<HTMLPreElement | null>(null)

  const setReaderStageRef = useCallback((node: HTMLDivElement | null) => {
    stageRef.current = node
    setStageNode(node)
  }, [])

  // ── Quick-settings panel ───────────────────────────────────────────────────

  const [showQuickSettings, setShowQuickSettings] = useState(false)
  // ── Reading position tracking ──────────────────────────────────────────────

 

  // ── Countdown before resuming ──────────────────────────────────────────────

 

  // ── Bookmarks ──────────────────────────────────────────────────────────────

 

 

 

  const handleGoalBookmarkConsumed = useCallback((bookmarkId: number) => {
    setGoalBookmark((current) => current?.id === bookmarkId ? null : current)
    setConsumedGoalBookmarkId(bookmarkId)
  }, [])

  const handleManualSeekTo = useCallback((index: number) => {
    setManualSeekRevision((revision) => revision + 1)
    seekTo(index)
  }, [seekTo])

  // One deep lifecycle hook: resume, saved position, goal/reread auto-stop, complete, and retokenize restore.
  const {
    countdown,
    showBookmarkPopover,
    validSavedIndex,
    resumePct,
    setShowBookmarkPopover,
    stopReading,
    handlePlay,
    handleResume,
    handleRestart,
    handleBeforeRetokenize,
    commitCurrentPosition,
    revertToBaseline,
    discardToStart: resetDiscardedSession,
    sessionEnd,
    clearSessionEnd,
  } = useReadingSessionLifecycle({
    text,
    stacks,
    currentIndex,
    playState: state,
    segmentCtx,
    resumeFromIndex,
    rereReadEndIndex,
    goalBookmark,
    manualSeekRevision,
    naturalEndRevision,
    sessionEndEnabled,
    play,
    playFrom,
    pause,
    stop,
    pauseAndHold,
    discardToStart,
    onGoalBookmarkConsumed: handleGoalBookmarkConsumed,
    onResumeHandled,
    onReadingComplete,
    refreshResumeCandidate,
  })

  const handleBack = useCallback(() => {
    void commitCurrentPosition()
    onBack()
  }, [commitCurrentPosition, onBack])

  const handleSessionDialogSaveExit = useCallback(() => {
    void commitCurrentPosition().then(() => {
      clearSessionEnd()
      onExitToLibrary()
    })
  }, [clearSessionEnd, commitCurrentPosition, onExitToLibrary])

  const handleSessionDialogExitWithoutSaving = useCallback(() => {
    void revertToBaseline().then(() => {
      resetDiscardedSession()
      clearSessionEnd()
      onExitToLibrary()
    })
  }, [clearSessionEnd, onExitToLibrary, resetDiscardedSession, revertToBaseline])

  const handleSessionDialogDismiss = useCallback(() => {
    clearSessionEnd()
  }, [clearSessionEnd])

  const handleQuickSettingsOpenChange = useCallback((open: boolean) => {
    if (open) setShowBookmarkPopover(false)
    setShowQuickSettings(open)
  }, [setShowBookmarkPopover])

  const handleBookmarkOpenChange = useCallback((open: boolean) => {
    if (open) setShowQuickSettings(false)
    if (!open) {
      setGoalPickArmed(false)
      setGoalPickDraft(null)
      if (returnFromSessionTargetPick) {
        setReturnFromSessionTargetPick(false)
        setShowPlainText(false)
      }
    }
    setShowBookmarkPopover(open)
  }, [returnFromSessionTargetPick, setShowBookmarkPopover])

  const handleArmGoalPick = useCallback((customLabel: string) => {
    pause()
    setShowBookmarkPopover(true)
    setShowQuickSettings(false)
    setReaderConfigDrawerOpen(false)
    setBrowsing(false)
    setShowPlainText(true)
    setTextViewMode('plain')
    setGoalPickDraft({ wordOffset: null, customLabel: customLabel.trim() })
    setGoalPickArmed(true)
  }, [pause, setReaderConfigDrawerOpen, setShowBookmarkPopover])

  const handleSessionDialogSetNewTarget = useCallback(() => {
    clearSessionEnd()
    setReturnFromSessionTargetPick(true)
    handleArmGoalPick('')
  }, [clearSessionEnd, handleArmGoalPick])

  const handleCancelGoalPick = useCallback(() => {
    setGoalPickArmed(false)
    setGoalPickDraft(null)
    if (returnFromSessionTargetPick) {
      setReturnFromSessionTargetPick(false)
      setShowBookmarkPopover(false)
      setShowPlainText(false)
    }
  }, [returnFromSessionTargetPick, setShowBookmarkPopover])

  const handleGoalWordPick = useCallback((wordOffset: number) => {
    setGoalPickArmed(false)
    setGoalPickDraft((draft) => ({
      wordOffset,
      customLabel: draft?.customLabel ?? '',
    }))
    setShowQuickSettings(false)
    setShowBookmarkPopover(true)
  }, [setShowBookmarkPopover])

  // Picking any library text returns the stage to reading.
  useEffect(() => { setBrowsing(false) }, [activeText])
  useEffect(() => {
    setGoalPickArmed(false)
    setGoalPickDraft(null)
    setReturnFromSessionTargetPick(false)
    setTextViewMode('plain')
  }, [activeText])
  useEffect(() => {
    if (!showPlainText) {
      setGoalPickArmed(false)
      setReturnFromSessionTargetPick(false)
      setTextViewMode('plain')
    }
  }, [showPlainText])

  const toggleBrowse = useCallback(() => {
    setBrowsing((wasBrowsing) => {
      if (!wasBrowsing) {
        pause()
        setShowPlainText(false)
        setShowQuickSettings(false)
        setShowBookmarkPopover(false)
        setReaderConfigDrawerOpen(false)
      }
      return !wasBrowsing
    })
  }, [pause, setReaderConfigDrawerOpen, setShowBookmarkPopover])

  // ── Stage resize observer ──────────────────────────────────────────────────

  useEffect(() => {
    if (!stageNode) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setStageDims({ width, height })
    })
    const { width, height } = stageNode.getBoundingClientRect()
    setStageDims({ width, height })
    ro.observe(stageNode)
    return () => ro.disconnect()
  }, [stageNode])

  useEffect(() => {
    const fontReady = document.fonts?.ready
    if (!fontReady || typeof fontReady.then !== 'function') return

    let cancelled = false
    fontReady.then(() => {
      if (!cancelled) setFontReadyRevision((revision) => revision + 1)
    }).catch(() => {})

    return () => { cancelled = true }
  }, [liveSettings.font_family])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Hide the controls overlay whenever fullscreen is exited
  useEffect(() => {
    if (!isFullscreen) setShowFsControls(false)
  }, [isFullscreen])

  // Leaving the reader (Back, hub-return, exit-to-library, session save-exit)
  // unmounts this component — revert OS fullscreen so we never strand the app
  // fullscreen in a non-reader view. Fullscreen is only ever used by the reader.
  useEffect(() => {
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [])

  // Derived on every render — stays in sync with currentIndex automatically.
  // Declared ahead of handleKeyDown so arrow-key paging can dispatch to it.
  const plainTextCtx = computePlainTextContext(text, currentIndex, stacks, segmentCtx)
  // The plain paged Text view is the only surface that needs paging; gate the
  // hook's whole-book scan on it so RSVP engage never pays for it (OL-1).
  const pagedPlainActive = showPlainText && textViewMode === 'plain'
  const textPaging = useTextPaging(displayContent, plainTextCtx.wordOffset, pagedPlainActive)

  // Keyboard shortcuts: the decision table lives in engine/readerKeymap.ts;
  // this handler only builds the input and dispatches the side effects.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const action = resolveReaderKeyAction({
        code: e.code,
        shiftKey: e.shiftKey,
        targetTag: (e.target as HTMLElement).tagName,
        tapToReadEnabled: liveSettings.tap_to_read,
        tapToReadKey: liveSettings.tap_to_read_key,
        liveRewindKey: liveSettings.live_rewind_key ?? 'Mouse1',
        liveRewindStacks: liveSettings.live_rewind_stacks ?? 1,
        playState: state,
        hasSavedIndex: validSavedIndex !== null,
        isFullscreen,
        showFsControls,
        showBookmarkPopover,
        goalPickArmed,
        showReaderConfigDrawer: readerConfigDrawerOpen,
        showQuickSettings,
        pagedPlainActive,
      })
      if (!action) return
      if (action.preventDefault) e.preventDefault()

      switch (action.type) {
        case 'advance':
          stepForward()
          break
        case 'pause':
          pause()
          break
        case 'resume':
          resume()
          break
        case 'resume-saved':
          handleResume()
          break
        case 'play':
          handlePlay()
          break
        case 'restart':
          handleRestart()
          restart()
          break
        case 'toggle-fs-controls':
          setShowFsControls((v) => !v)
          break
        case 'cancel-goal-pick':
          handleCancelGoalPick()
          break
        case 'close-bookmark-popover':
          handleBookmarkOpenChange(false)
          break
        case 'close-reader-config-drawer':
          setReaderConfigDrawerOpen(false)
          break
        case 'close-quick-settings':
          setShowQuickSettings(false)
          break
        case 'hide-fs-controls':
          setShowFsControls(false)
          break
        case 'exit-fullscreen':
          document.exitFullscreen().catch(() => {})
          break
        case 'stop-reading':
          stopReading()
          break
        case 'toggle-fullscreen':
          toggleFullscreen()
          break
        case 'toggle-plain-text':
          setShowPlainText((v) => !v)
          break
        case 'rewind':
          rewind(action.amount)
          break
        case 'live-rewind':
          rewind(action.amount)
          break
        case 'seek-forward':
          handleManualSeekTo(Math.min(stacks.length - 1, currentIndex + action.amount))
          break
        case 'page-prev':
          textPaging.goPrev()
          break
        case 'page-next':
          textPaging.goNext()
          break
      }
    },
    [state, handlePlay, handleResume, handleRestart, pause, resume, stopReading, restart, rewind, handleManualSeekTo, stepForward,
     stacks.length, currentIndex, toggleFullscreen, validSavedIndex, showQuickSettings, showBookmarkPopover,
     readerConfigDrawerOpen, setReaderConfigDrawerOpen, isFullscreen, showFsControls,
     liveSettings.tap_to_read, liveSettings.tap_to_read_key, liveSettings.live_rewind_key,
     setShowBookmarkPopover, handleBookmarkOpenChange,
     liveSettings.live_rewind_stacks,
     showPlainText, textViewMode, pagedPlainActive, textPaging, goalPickArmed, handleCancelGoalPick]
  )

  const handleLiveRewind = useCallback(() => {
    rewind(liveSettings.live_rewind_stacks ?? 1)
  }, [rewind, liveSettings.live_rewind_stacks])

  const handleStageMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const action = resolveStageMouseClick({
        playState: state,
        countdownActive: countdown !== null,
        tapToRead: liveSettings.tap_to_read,
        liveRewindKey: liveSettings.live_rewind_key ?? 'Mouse1',
        button: e.button,
        clientX: e.clientX,
        rect: e.currentTarget.getBoundingClientRect(),
        mouseEvent: e.nativeEvent,
      })
      if (action === 'rewind') handleLiveRewind()
      else if (action === 'advance') stepForward()
      if (action) e.preventDefault()
    },
    [
      state,
      countdown,
      liveSettings.tap_to_read,
      liveSettings.live_rewind_key,
      handleLiveRewind,
      stepForward,
    ]
  )

  const handleStageMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!liveSettings.tap_to_read || state !== 'playing') {
        setTapHoverSide(null)
        return
      }
      const rect = e.currentTarget.getBoundingClientRect()
      setTapHoverSide(isStageLeftHalf(e.clientX, rect) ? 'left' : 'right')
    },
    [liveSettings.tap_to_read, state]
  )

  const handleStageMouseLeave = useCallback(() => {
    setTapHoverSide(null)
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const stacksVisible = liveSettings.stacks_visible
  const configuredLinesCount = liveSettings.lines_enabled ? Math.max(1, liveSettings.lines_count) : 1
  const configuredBlock = deriveBlockPosition(currentIndex, stacksVisible, configuredLinesCount)
  const configuredBlockSize = configuredLinesCount * stacksVisible

  const blockStackTexts = useMemo(
    () =>
      Array.from({ length: configuredBlockSize }, (_, index) => {
        const stack = stacks[configuredBlock.blockStart + index]
        return stack ? stack.words.join(' ') : ''
      }).filter(Boolean),
    [configuredBlock.blockStart, configuredBlockSize, stacks]
  )

  const layoutMeasureWidth = useMemo(() => createMeasureWidth(), [fontReadyRevision])

  const readerLayout = useMemo<SolveReaderLayoutResult>(() => {
    const fallback = {
      width: 0,
      height: 0,
      effectiveFontSize: liveSettings.font_size,
      effectiveStackGap: liveSettings.stack_gap,
      effectiveRowGap: liveSettings.lines_row_gap,
      effectiveLinesCount: configuredLinesCount,
      clampedVerticalOffset: liveSettings.stack_vertical_offset,
      clampedHorizontalOffset: liveSettings.stack_horizontal_offset,
      stacksVisible,
      wordsPerStack: liveSettings.words_per_stack,
      degradation: {
        stage: 'stage-1' as const,
        axis: 'none' as const,
        comfortFontSize: READER_MIN_VISIBLE_FONT_SIZE,
      },
    }

    if (stageDims.width <= 0 || stageDims.height <= 0) return fallback

    return solveReaderLayout({
      stageWidth: stageDims.width,
      stageHeight: stageDims.height,
      stackTexts: blockStackTexts,
      stacksVisible,
      wordsPerStack: liveSettings.words_per_stack,
      fontSize: liveSettings.font_size,
      linesCount: configuredLinesCount,
      stackGap: liveSettings.stack_gap,
      rowGap: liveSettings.lines_row_gap,
      stackVerticalOffset: liveSettings.stack_vertical_offset,
      stackHorizontalOffset: liveSettings.stack_horizontal_offset,
      fontFamily: liveSettings.font_family,
      fontWeight: 700,
      measureWidth: layoutMeasureWidth,
    })
  }, [
    blockStackTexts,
    configuredLinesCount,
    layoutMeasureWidth,
    liveSettings.font_family,
    liveSettings.font_size,
    liveSettings.lines_row_gap,
    liveSettings.stack_gap,
    liveSettings.stack_horizontal_offset,
    liveSettings.stack_vertical_offset,
    liveSettings.words_per_stack,
    stacksVisible,
    stageDims.height,
    stageDims.width,
  ])

  const effectiveLinesCount = readerLayout.effectiveLinesCount
  const { blockStart, currentLineIdx, currentSlotIdx, lineKey } = deriveBlockPosition(currentIndex, stacksVisible, effectiveLinesCount)

  let revealUpToSlot = panningBarRevealUpToSlot(currentSlotIdx, stacksVisible, liveSettings.highlight_mode, liveSettings.highlight_panning_chunk_size)

  // Prevent content from vanishing when the highlight mode changes mid-row (e.g. panning → default).
  // Once a slot is revealed in the current row, keep it visible until the row resets.
  const nextReveal = nextRevealState(revealStateRef.current, lineKey, revealUpToSlot)
  revealStateRef.current = nextReveal
  revealUpToSlot = nextReveal.revealUpTo

  const displayRows = buildDisplayRows(stacks, blockStart, currentLineIdx, stacksVisible, revealUpToSlot)

  const isSlotHighlighted = computeHighlightedSlots(
    liveSettings.highlight_mode ?? 'default',
    currentLineIdx,
    currentSlotIdx,
    stacksVisible,
    { chunkSize: liveSettings.highlight_panning_chunk_size ?? 0 },
  )

  const gridTemplateColumns = buildGridTemplateColumns(stacksVisible, readerLayout.effectiveStackGap)

  // Match the transition duration to the current beat interval so the bar advances exactly
  // one step per beat and interruptions never cause the ease-restart stutter.
  const progressTransitionMs = Math.max(50, Math.min(300, Math.round(60_000 / liveSettings.bpm)))

  const totalWords = stacks.reduce((s, st) => s + st.words.length, 0)
  const wordsRead = wordOffsetAtIndex(stacks, currentIndex)
  const sessionDialogVariant = sessionEndEnabled && sessionEnd
    ? sessionEnd.reason
    : null
  const minutesLeft = computeMinutesLeft(totalWords, wordsRead, wpm)
  const goalBookmarkIndex = useMemo(
    () =>
      goalBookmark && stacks.length > 0
        ? resolveWordsToStackIndex(goalBookmark.wordOffset, stacks)
        : null,
    [goalBookmark, stacks]
  )
  const normalBookmarkMarkers = useMemo(
    () =>
      bookmarks
        .filter((bookmark) => bookmark.kind === 'normal')
        .map((bookmark) => ({
          id: bookmark.id,
          label: bookmark.label,
          stackIndex: resolveWordsToStackIndex(bookmark.wordOffset, stacks),
        })),
    [bookmarks, stacks]
  )

  const useTextConsole = pagedPlainActive
  const readerLayoutAdvisory = useMemo(
    () => ({
      degradation: readerLayout.degradation,
      effectiveFontSize: readerLayout.effectiveFontSize,
    }),
    [readerLayout.degradation, readerLayout.effectiveFontSize]
  )

  const handleTextLocate = useCallback(() => {
    textPaging.locate()
    setTextLocateRevision((revision) => revision + 1)
  }, [textPaging])

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleManualSeekTo(Number(e.target.value))
  }

  // ── Quick-settings panel logic ─────────────────────────────────────────────

  // Update liveSettings + persist; used by all controls except the WPS slider drag
  const handleQuickSet = useCallback((patch: Partial<Settings>) => {
    setLiveSettings((prev) => ({ ...prev, ...patch }))
    onSettingsChange?.(patch)
  }, [onSettingsChange])

  // Apply a patch to the live settings shadow only — no persistence (slider drag preview).
  const handleLiveSet = useCallback((patch: Partial<Settings>) => {
    setLiveSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  // Persist a patch only — no live update (slider release commit).
  const handlePersist = useCallback((patch: Partial<Settings>) => {
    onSettingsChange?.(patch)
  }, [onSettingsChange])

  const handleDrawerSet = useCallback((patch: Partial<Settings>) => {
    if (
      patch.words_per_stack !== undefined &&
      patch.words_per_stack !== liveSettings.words_per_stack
    ) {
      handleBeforeRetokenize()
    }
    handleQuickSet(patch)
  }, [handleBeforeRetokenize, handleQuickSet, liveSettings.words_per_stack])

  const resolvedHighlightTextColor = resolveHighlightTextColor(
    liveSettings.highlight_color,
    liveSettings.highlight_text_color,
  )
  const countdownColor = autoTextColor(liveSettings.viewport_bg_color)

  const readerStyle = {
    ...buildReaderCssVars({
      highlightColor: liveSettings.highlight_color,
      stageBgColor: liveSettings.viewport_bg_color,
      textColor: liveSettings.text_color,
      fontFamily: liveSettings.font_family,
      highlightTextColor: resolvedHighlightTextColor,
    }),
  } as React.CSSProperties

  return (
    <div
      className={`reader-shell${isFullscreen ? ' reader-shell--fullscreen' : ''}${isFullscreen && showFsControls ? ' reader-shell--fs-controls' : ''}${isFullscreen && (showQuickSettings || showBookmarkPopover) ? ' reader-shell--fs-popover' : ''}`}
      style={readerStyle}
    >
      {/* Top bar */}
      <ReaderTopbar
        title={text.title}
        tapToRead={liveSettings.tap_to_read}
        wpm={wpm}
        minutesLeft={minutesLeft}
        showPlainText={showPlainText}
        isFullscreen={isFullscreen}
        backLabel={backLabel}
        onBack={handleBack}
        onTogglePlainText={() => setShowPlainText((v) => !v)}
        onToggleFullscreen={toggleFullscreen}
      />

      {/* Progress bar + scrubber */}
      <ReaderScrubber
        currentIndex={currentIndex}
        stacksLength={stacks.length}
        progress={progress}
        transitionMs={progressTransitionMs}
        rereReadEndIndex={rereReadEndIndex}
        goalBookmarkIndex={goalBookmarkIndex}
        normalBookmarkMarkers={normalBookmarkMarkers}
        onSeek={handleSeek}
      />

      {/* Text view / RSVP stage — mutually exclusive */}
      <div className={`reader-main${readerConfigDrawerOpen ? ' reader-main--drawer-open' : ''}`}>
        <div
          className="reader-stage-slot"
          style={sessionDialogVariant ? { position: 'relative' } : undefined}
        >
          {browsing ? (
            <ReaderLibraryBrowse />
          ) : showPlainText ? (
            <TextViewPanel
              text={text}
              displayContent={displayContent}
              plainTextCtx={plainTextCtx}
              paging={textPaging}
              textViewMode={textViewMode}
              onTextViewModeChange={setTextViewMode}
              locateRevision={textLocateRevision}
              showPlainText={showPlainText}
              goalPickArmed={goalPickArmed}
              onGoalWordPick={handleGoalWordPick}
              plainTextContentRef={plainTextContentRef}
              bookmarks={bookmarks}
            />
          ) : (
            /* Main display */
            <div
              className={[
                'reader-stage',
                liveSettings.tap_to_read && state === 'playing' ? 'reader-stage--tap' : '',
                tapHoverSide === 'left' ? 'reader-stage--tap-hover-left' : '',
                tapHoverSide === 'right' ? 'reader-stage--tap-hover-right' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              ref={setReaderStageRef}
              aria-live="polite"
              aria-atomic="true"
              onMouseDown={handleStageMouseDown}
              onMouseMove={handleStageMouseMove}
              onMouseLeave={handleStageMouseLeave}
            >
              {countdown !== null ? (
                <ReaderCountdown countdown={countdown} color={countdownColor} />
              ) : state === 'idle' || state === 'stopped' ? (
                <ReaderIdle
                  playState={state}
                  logoSrc={logoSrc}
                  tapToRead={liveSettings.tap_to_read}
                  wpm={wpm}
                  totalWords={totalWords}
                  resumePct={resumePct}
                />
              ) : displayRows.length > 0 ? (
                <StackGrid
                  displayRows={displayRows}
                  gridTemplateColumns={gridTemplateColumns}
                  blockStart={blockStart}
                  stacksVisible={stacksVisible}
                  highlightActive={liveSettings.highlight_active}
                  // view_style + show_chunk_dividers are de-UI'd and no longer honoured
                  // (ADR-0019 §4): always render as 'default' with dividers off, so a
                  // stored value can't strand a reader in a mode with no off switch. The
                  // StackGrid/stackLayout render paths stay capable but dormant.
                  focalPointsView={false}
                  showChunkDividers={false}
                  isSlotHighlighted={isSlotHighlighted}
                  fontSize={readerLayout.effectiveFontSize}
                  verticalOffset={readerLayout.clampedVerticalOffset}
                  horizontalOffset={readerLayout.clampedHorizontalOffset}
                  rowGap={readerLayout.effectiveRowGap}
                />
              ) : null}
            </div>
          )}
          {sessionDialogVariant && (
            <SessionDialog
              variant={sessionDialogVariant}
              progressPercent={progress * 100}
              wordsRead={wordsRead}
              totalWords={totalWords}
              onSaveExit={handleSessionDialogSaveExit}
              onExitWithoutSaving={handleSessionDialogExitWithoutSaving}
              onAbort={handleSessionDialogDismiss}
              onContinue={handleSessionDialogDismiss}
              onSetNewTarget={handleSessionDialogSetNewTarget}
              onDismiss={handleSessionDialogDismiss}
            />
          )}
        </div>
        <ReaderConfigDrawer
          open={readerConfigDrawerOpen}
          value={liveSettings}
          onChange={handleDrawerSet}
          onClose={() => setReaderConfigDrawerOpen(false)}
          layoutAdvisory={readerLayoutAdvisory}
        />
      </div>

      {/* Controls */}
      <ReaderControls
        playState={state}
        currentIndex={currentIndex}
        stacksLength={stacks.length}
        hasSavedIndex={validSavedIndex !== null}
        resumePct={resumePct}
        countdownActive={countdown !== null}
        onRestart={() => { handleRestart(); restart() }}
        onRewind={() => rewind(10)}
        onPause={pause}
        onResume={resume}
        onResumeSaved={handleResume}
        onPlay={handlePlay}
        onSkipForward={() => handleManualSeekTo(Math.min(stacks.length - 1, currentIndex + 10))}
        onStop={stopReading}
        leftSlot={isFullscreen ? (
          <span className="reader-meta reader-controls-meta">
            {liveSettings.tap_to_read ? 'Tap mode' : `${wpm} wpm · ${minutesLeft} min left`}
          </span>
        ) : libraryBrowseEnabled ? (
          <ReaderBrowseToggle browsing={browsing} onToggleBrowse={toggleBrowse} />
        ) : undefined}
        transport={useTextConsole ? (
          <div className="plain-text-console-transport">
            <TextConsolePager
              currentPage={textPaging.currentPage}
              totalPages={textPaging.totalPages}
              canBack={textPaging.canBack}
              canForward={textPaging.canForward}
              onPrev={textPaging.goPrev}
              onNext={textPaging.goNext}
            />
            <TextConsoleLocateButton
              detached={textPaging.detached}
              onLocate={handleTextLocate}
            />
          </div>
        ) : undefined}
        utilities={
          <>
            <BookmarkPopover
              open={showBookmarkPopover}
              onOpenChange={handleBookmarkOpenChange}
              text={text}
              currentIndex={currentIndex}
              stacks={stacks}
              goalPickDraft={goalPickDraft}
              goalPickArmed={goalPickArmed}
              plainTextContentRef={plainTextContentRef}
              onArmGoalPick={handleArmGoalPick}
              onCancelGoalPick={handleCancelGoalPick}
              onSeek={handleManualSeekTo}
              onBookmarksChange={setBookmarks}
              onGoalBookmarkChange={setGoalBookmark}
              consumedBookmarkId={consumedGoalBookmarkId}
              hidden={browsing}
            />
            <QuickSettingsPopover
              embedded
              open={showQuickSettings}
              onOpenChange={handleQuickSettingsOpenChange}
              liveSettings={liveSettings}
              onQuickSet={handleQuickSet}
              onLiveSet={handleLiveSet}
              onPersist={handlePersist}
              onBeforeRetokenize={handleBeforeRetokenize}
              onSeeMoreSettings={() => setReaderConfigDrawerOpen(true)}
            />
          </>
        }
      />

      {/* Keyboard hint */}
      <ReaderKeyhints
        tapToRead={liveSettings.tap_to_read}
        tapToReadKey={liveSettings.tap_to_read_key}
        liveRewindKey={liveSettings.live_rewind_key}
        hasSavedIndex={validSavedIndex !== null}
        playState={state}
      />
    </div>
  )
}
