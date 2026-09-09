import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react'
import { useLibrary } from '../contexts/LibraryContext'
import { useSettings } from '../contexts/SettingsContext'
import { useReader } from '../contexts/ReaderContext'
import logoModernSrc from '../assets/logo-modern.png'
import libraryToggleDarkSrc from '../assets/reader-tiles/library-toggle-dark.png'
import libraryToggleLightSrc from '../assets/reader-tiles/library-toggle-light.png'
import { useReadingSession } from '../hooks/useReadingSession'
import { useReaderSurfaces } from '../hooks/useReaderSurfaces'
import { useSessionStatsSummary } from '../hooks/useSessionStatsSummary'
import { useBookmarkCollection } from '../hooks/useBookmarkCollection'
import { computePlainTextContext } from '../engine/plainTextContext'
import { useTextPaging } from '../engine/useTextPaging'
import { autoTextColor, resolveHighlightTextColor } from '../engine/highlightColor'
import { buildReaderCssVars } from '../engine/readerCssVars'
import { useReaderFrame } from '../hooks/useReaderFrame'
import type { ReaderFrameConfig } from '../engine/readerFrame'
import { computeMinutesLeft, type SessionCompletion } from '../engine/readerSession'
import { displayRenditionOf } from '../engine/wordIndex'
import { useTextWordIndex, useWordIndex } from '../hooks/useWordIndex'
import { resolveReaderKeyAction } from '../engine/readerKeymap'
import { isStageLeftHalf, resolveStageMouseClick } from '../engine/readerBindings'
import type { Settings } from '../types'
import {
  effectiveLinesCount as getEffectiveLinesCount,
  resolvedLinesAnchor,
} from '../../../shared/settings'
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
  /**
   * Which completion path a finished reading run takes in this host. The
   * standard Reader shows the guided Session dialog (ADR-0026); the Overlay
   * Reader keeps its own completion/close path, so it selects `host-completion`.
   */
  completion?: SessionCompletion
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


// What is left here is **size**, not coordination: the props-in/JSX-out body of a
// large screen. The session (ADR-0026), the surface exclusion and the Target-pick
// mode all live behind their own interfaces now; the guard still measures this
// function because it renders the whole reader in one place. That is the
// `codebase-health` cascade's target, not `architecture-depth`'s — do not widen
// the global 20/15/30 ceilings for it.
// fallow-ignore-next-line complexity
export default function Reader({
  onBack,
  onExitToLibrary,
  backLabel = 'Library',
  completion = 'session-dialog',
  libraryBrowseEnabled = true,
}: Props) {
  const { activeText } = useLibrary()
  const { settings, saveSettings: onSettingsChange } = useSettings()
  const {
    activeSegmentCtx: segmentCtx,
    readerRereReadEnd: rereReadEndIndex,
    readerResumeFrom: savedResumeFromIndex,
    readerResumeFromWordOffset: resumeFromWordOffset,
    readerConfigDrawerOpen,
    setReaderConfigDrawerOpen,
    refreshResumeCandidate,
    handleResumeHandled: onResumeHandled,
    handleReadingComplete: onReadingComplete,
  } = useReader()
  const text = activeText!

  const logoSrc = logoModernSrc
  // The rendition the words are read from — the same expression the bookmark
  // snippets used to compute separately (`architecture-depth/08`).
  const displayContent = displayRenditionOf(text ?? { content: '' })

  // Live settings shadow — initialized once from props, mutated by the quick-settings panel.
  // Passed to the session so changes take effect immediately without a full re-mount.
  const [liveSettings, setLiveSettings] = useState<Settings>(settings)

  const [stageNode, setStageNode] = useState<HTMLDivElement | null>(null)
  const [tapHoverSide, setTapHoverSide] = useState<'left' | 'right' | null>(null)

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showFsControls, setShowFsControls] = useState(false)
  const [stageDims, setStageDims] = useState({ width: 0, height: 0 })
  const plainTextContentRef = useRef<HTMLPreElement | null>(null)

  // The engaged text's bookmarks (ADR-0024). The Reader owns the list: the
  // scrubber marks it, the Text view decorates from it, the session is handed
  // its Target, and the popover renders and mutates it. Nothing is pushed back
  // up (`architecture-depth/12`).
  const bookmarks = useBookmarkCollection({ textId: text?.id })

  // One reading session (ADR-0026): the playback timer and index, the resume
  // countdown, the position saves, the session baseline, goal crossing and the
  // natural end — all behind one interface (`architecture-depth/11`).
  const session = useReadingSession({
    text,
    settings: liveSettings,
    segmentCtx,
    completion,
    rereReadEndIndex,
    goalBookmark: bookmarks.goalBookmark,
    resumeFromIndex: savedResumeFromIndex,
    resumeFromWordOffset,
    onResumeHandled,
    onGoalBookmarkConsumed: bookmarks.forget,
    onReadingComplete,
    refreshResumeCandidate,
  })
  const {
    stacks,
    stackIndex,
    currentIndex,
    playState,
    wpm,
    progress,
    countdown,
    sessionEnd,
    validSavedIndex,
    resumePct,
  } = session

  // ADR-0035 §6: the finished session's own numbers ride the session interface,
  // so only the baseline is fetched — and only while the dialog is up.
  const sessionStats = useSessionStatsSummary(sessionEnd ? session.finishedSessionStats : null)

  // One owner of which surface is open — quick settings, the bookmark popover,
  // the config drawer, the plain-text view, library browse — and of the
  // Target-pick mode that spans two of them (`architecture-depth/12`).
  const surfaces = useReaderSurfaces({
    text,
    configDrawerOpen: readerConfigDrawerOpen,
    setConfigDrawerOpen: setReaderConfigDrawerOpen,
    pause: session.pause,
    dismissSessionEnd: session.dismissSessionEnd,
  })

  const handleBack = useCallback(() => {
    void session.commit()
    onBack()
  }, [session, onBack])

  const handleSessionDialogSaveExit = useCallback(() => {
    void session.commit().then(() => {
      session.dismissSessionEnd()
      onExitToLibrary()
    })
  }, [session, onExitToLibrary])

  const handleSessionDialogExitWithoutSaving = useCallback(() => {
    void session.discard().then(() => {
      onExitToLibrary()
    })
  }, [session, onExitToLibrary])

  const handleSessionDialogDismiss = useCallback(() => {
    session.dismissSessionEnd()
  }, [session])

  /** ADR-0026's "Set a new target": one intent, and the mode owns the rest. */
  const handleSessionDialogSetNewTarget = useCallback(() => {
    surfaces.armGoalPick('', 'session-dialog')
  }, [surfaces])

  // ADR-0035 §2: a pause during which the user opens a reader surface is setup,
  // not struggle — every move into an open surface (including the auto-pausing
  // ones: browse entry, arming a Target pick) exempts the current pause span.
  const { noteSetupActivity } = session
  useEffect(() => {
    if (
      surfaces.panel !== 'none' ||
      surfaces.browsing ||
      surfaces.textViewOpen ||
      surfaces.goalPickArmed
    ) {
      noteSetupActivity()
    }
  }, [surfaces.panel, surfaces.browsing, surfaces.textViewOpen, surfaces.goalPickArmed, noteSetupActivity])

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
  const pagedPlainActive = surfaces.textViewOpen && surfaces.textViewMode === 'plain'
  // The text half is the whole-book walk, so it waits for a surface that
  // actually needs words: the paged plain view, or the bookmark popover with
  // its snippets. RSVP engage pays for neither (OL-1).
  const textIndex = useTextWordIndex(displayContent, pagedPlainActive || surfaces.bookmarksOpen)
  const wordIndex = useWordIndex(stackIndex, textIndex)
  const textPaging = useTextPaging(textIndex, plainTextCtx.wordOffset)

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
        playState,
        hasSavedIndex: validSavedIndex !== null,
        isFullscreen,
        showFsControls,
        showBookmarkPopover: surfaces.bookmarksOpen,
        goalPickArmed: surfaces.goalPickArmed,
        showReaderConfigDrawer: surfaces.configDrawerOpen,
        showQuickSettings: surfaces.quickSettingsOpen,
        pagedPlainActive,
      })
      if (!action) return
      if (action.preventDefault) e.preventDefault()

      switch (action.type) {
        case 'advance':
          session.step()
          break
        case 'pause':
          session.pause()
          break
        case 'resume':
          session.resume()
          break
        case 'resume-saved':
          session.resumeSaved()
          break
        case 'play':
          session.play()
          break
        case 'restart':
          session.restart()
          break
        case 'toggle-fs-controls':
          setShowFsControls((v) => !v)
          break
        case 'cancel-goal-pick':
          surfaces.leaveGoalPick()
          break
        case 'close-bookmark-popover':
          surfaces.openBookmarks(false)
          break
        case 'close-reader-config-drawer':
          surfaces.openConfigDrawer(false)
          break
        case 'close-quick-settings':
          surfaces.openQuickSettings(false)
          break
        case 'hide-fs-controls':
          setShowFsControls(false)
          break
        case 'exit-fullscreen':
          document.exitFullscreen().catch(() => {})
          break
        case 'stop-reading':
          session.stop()
          break
        case 'toggle-fullscreen':
          toggleFullscreen()
          break
        case 'toggle-plain-text':
          surfaces.toggleTextView()
          break
        case 'rewind':
          session.rewind(action.amount)
          break
        case 'live-rewind':
          session.rewind(action.amount)
          break
        case 'seek-forward':
          session.seekTo(Math.min(stacks.length - 1, currentIndex + action.amount))
          break
        case 'page-prev':
          textPaging.goPrev()
          break
        case 'page-next':
          textPaging.goNext()
          break
      }
    },
    [session, surfaces, playState,
     stacks.length, currentIndex, toggleFullscreen, validSavedIndex,
     isFullscreen, showFsControls,
     liveSettings.tap_to_read, liveSettings.tap_to_read_key, liveSettings.live_rewind_key,
     liveSettings.live_rewind_stacks,
     pagedPlainActive, textPaging]
  )

  const handleLiveRewind = useCallback(() => {
    session.rewind(liveSettings.live_rewind_stacks ?? 1)
  }, [session, liveSettings.live_rewind_stacks])

  const handleStageMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const action = resolveStageMouseClick({
        playState,
        countdownActive: countdown !== null,
        tapToRead: liveSettings.tap_to_read,
        liveRewindKey: liveSettings.live_rewind_key ?? 'Mouse1',
        button: e.button,
        clientX: e.clientX,
        rect: e.currentTarget.getBoundingClientRect(),
        mouseEvent: e.nativeEvent,
      })
      if (action === 'rewind') handleLiveRewind()
      else if (action === 'advance') session.step()
      if (action) e.preventDefault()
    },
    [
      playState,
      countdown,
      liveSettings.tap_to_read,
      liveSettings.live_rewind_key,
      handleLiveRewind,
      session,
    ]
  )

  const handleStageMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!liveSettings.tap_to_read || playState !== 'playing') {
        setTapHoverSide(null)
        return
      }
      const rect = e.currentTarget.getBoundingClientRect()
      setTapHoverSide(isStageLeftHalf(e.clientX, rect) ? 'left' : 'right')
    },
    [liveSettings.tap_to_read, playState]
  )

  const handleStageMouseLeave = useCallback(() => {
    setTapHoverSide(null)
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Every geometric decision for the stage lives in the reader frame module; this
  // component only supplies the configuration and paints what comes back.
  const frameConfig = useMemo<ReaderFrameConfig>(() => ({
    stacksVisible: liveSettings.stacks_visible,
    wordsPerStack: liveSettings.words_per_stack,
    linesCount: getEffectiveLinesCount(liveSettings),
    linesAnchor: resolvedLinesAnchor(liveSettings),
    fontSize: liveSettings.font_size,
    stackGap: liveSettings.stack_gap,
    rowGap: liveSettings.lines_row_gap,
    stackVerticalOffset: liveSettings.stack_vertical_offset,
    stackHorizontalOffset: liveSettings.stack_horizontal_offset,
    fontFamily: liveSettings.font_family,
    fontWeight: 700,
    highlightActive: liveSettings.highlight_active,
    highlightMode: liveSettings.highlight_mode ?? 'default',
    highlightPanningChunkSize: liveSettings.highlight_panning_chunk_size ?? 0,
    // view_style + show_chunk_dividers are de-UI'd and no longer honoured
    // (ADR-0019 §4): always paint as 'default' with dividers off, so a stored
    // value can't strand a reader in a mode with no off switch. The frame and
    // StackGrid render paths stay capable but dormant.
    focalPointsView: false,
    showChunkDividers: false,
  }), [
    liveSettings.font_family,
    liveSettings.font_size,
    liveSettings.highlight_active,
    liveSettings.highlight_mode,
    liveSettings.highlight_panning_chunk_size,
    liveSettings.lines_anchor,
    liveSettings.lines_count,
    liveSettings.lines_row_gap,
    liveSettings.stack_gap,
    liveSettings.stack_horizontal_offset,
    liveSettings.stack_vertical_offset,
    liveSettings.stacks_visible,
    liveSettings.words_per_stack,
  ])

  const frame = useReaderFrame({
    stacks,
    currentIndex,
    config: frameConfig,
    stage: stageDims,
  })

  // Match the transition duration to the current beat interval so the bar advances exactly
  // one step per beat and interruptions never cause the ease-restart stutter.
  const progressTransitionMs = Math.max(50, Math.min(300, Math.round(60_000 / liveSettings.bpm)))

  const { totalWords, wordsRead } = session
  const minutesLeft = computeMinutesLeft(totalWords, wordsRead, wpm)
  const normalBookmarkMarkers = useMemo(
    () =>
      bookmarks.bookmarks
        .filter((bookmark) => bookmark.kind === 'normal')
        .map((bookmark) => ({
          id: bookmark.id,
          label: bookmark.label,
          stackIndex: stackIndex.stackAtOffset(bookmark.wordOffset),
        })),
    [bookmarks.bookmarks, stackIndex]
  )

  const useTextConsole = pagedPlainActive
  const readerLayoutAdvisory = useMemo(
    () => ({
      degradation: frame.geometry.degradation,
      effectiveFontSize: frame.geometry.fontSize,
    }),
    [frame.geometry.degradation, frame.geometry.fontSize]
  )

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    session.seekTo(Number(e.target.value))
  }

  // ── Quick-settings panel logic ─────────────────────────────────────────────

  // Update liveSettings + persist; used by all controls except the WPS slider drag
  const handleQuickSet = useCallback((patch: Partial<Settings>) => {
    // A reader setting changing is setup activity (ADR-0035 §2) — it exempts
    // the current counted-pause span, same as a surface opening.
    noteSetupActivity()
    setLiveSettings((prev) => ({ ...prev, ...patch }))
    onSettingsChange?.(patch)
  }, [onSettingsChange, noteSetupActivity])

  // Apply a patch to the live settings shadow only — no persistence (slider drag preview).
  const handleLiveSet = useCallback((patch: Partial<Settings>) => {
    noteSetupActivity()
    setLiveSettings((prev) => ({ ...prev, ...patch }))
  }, [noteSetupActivity])

  // Persist a patch only — no live update (slider release commit).
  const handlePersist = useCallback((patch: Partial<Settings>) => {
    noteSetupActivity()
    onSettingsChange?.(patch)
  }, [onSettingsChange, noteSetupActivity])

  const handleDrawerSet = useCallback((patch: Partial<Settings>) => {
    if (
      patch.words_per_stack !== undefined &&
      patch.words_per_stack !== liveSettings.words_per_stack
    ) {
      session.beforeRetokenize()
    }
    handleQuickSet(patch)
  }, [session, handleQuickSet, liveSettings.words_per_stack])

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

  const popoverOpen = surfaces.quickSettingsOpen || surfaces.bookmarksOpen

  return (
    <div
      className={`reader-shell${isFullscreen ? ' reader-shell--fullscreen' : ''}${isFullscreen && showFsControls ? ' reader-shell--fs-controls' : ''}${isFullscreen && popoverOpen ? ' reader-shell--fs-popover' : ''}`}
      style={readerStyle}
    >
      {/* Top bar */}
      <ReaderTopbar
        title={text.title}
        tapToRead={liveSettings.tap_to_read}
        wpm={wpm}
        minutesLeft={minutesLeft}
        showPlainText={surfaces.textViewOpen}
        isFullscreen={isFullscreen}
        backLabel={backLabel}
        onBack={handleBack}
        onTogglePlainText={surfaces.toggleTextView}
        onToggleFullscreen={toggleFullscreen}
      />

      {/* Progress bar + scrubber */}
      <ReaderScrubber
        currentIndex={currentIndex}
        stacksLength={stacks.length}
        progress={progress}
        transitionMs={progressTransitionMs}
        rereReadEndIndex={rereReadEndIndex}
        goalBookmarkIndex={session.goalStackIndex}
        normalBookmarkMarkers={normalBookmarkMarkers}
        onSeek={handleSeek}
      />

      {/* Text view / RSVP stage — mutually exclusive */}
      <div className={`reader-main${surfaces.configDrawerOpen ? ' reader-main--drawer-open' : ''}`}>
        <div
          className="reader-stage-slot"
          style={sessionEnd ? { position: 'relative' } : undefined}
        >
          {surfaces.stage === 'browse' ? (
            <ReaderLibraryBrowse />
          ) : surfaces.stage === 'text-view' ? (
            <TextViewPanel
              text={text}
              displayContent={displayContent}
              plainTextCtx={plainTextCtx}
              paging={textPaging}
              textViewMode={surfaces.textViewMode}
              onTextViewModeChange={surfaces.setTextViewMode}
              showPlainText={surfaces.textViewOpen}
              goalPickArmed={surfaces.goalPickArmed}
              onGoalWordPick={surfaces.pickGoalWord}
              plainTextContentRef={plainTextContentRef}
              bookmarks={bookmarks.bookmarks}
            />
          ) : (
            /* Main display */
            <div
              className={[
                'reader-stage',
                liveSettings.tap_to_read && playState === 'playing' ? 'reader-stage--tap' : '',
                tapHoverSide === 'left' ? 'reader-stage--tap-hover-left' : '',
                tapHoverSide === 'right' ? 'reader-stage--tap-hover-right' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              ref={setStageNode}
              aria-live="polite"
              aria-atomic="true"
              onMouseDown={handleStageMouseDown}
              onMouseMove={handleStageMouseMove}
              onMouseLeave={handleStageMouseLeave}
            >
              {countdown !== null ? (
                <ReaderCountdown countdown={countdown} color={countdownColor} />
              ) : playState === 'idle' || playState === 'stopped' ? (
                <ReaderIdle
                  playState={playState}
                  logoSrc={logoSrc}
                  tapToRead={liveSettings.tap_to_read}
                  wpm={wpm}
                  totalWords={totalWords}
                  resumePct={resumePct}
                />
              ) : frame.rows.length > 0 ? (
                <StackGrid frame={frame} />
              ) : null}
            </div>
          )}
          {sessionEnd && (
            <SessionDialog
              variant={sessionEnd}
              progressPercent={progress * 100}
              wordsRead={wordsRead}
              totalWords={totalWords}
              sessionStats={sessionStats}
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
          open={surfaces.configDrawerOpen}
          value={liveSettings}
          onChange={handleDrawerSet}
          onClose={() => surfaces.openConfigDrawer(false)}
          layoutAdvisory={readerLayoutAdvisory}
        />
      </div>

      {/* Controls */}
      <ReaderControls
        playState={playState}
        currentIndex={currentIndex}
        stacksLength={stacks.length}
        hasSavedIndex={validSavedIndex !== null}
        resumePct={resumePct}
        countdownActive={countdown !== null}
        onRestart={session.restart}
        onRewind={() => session.rewind(10)}
        onPause={session.pause}
        onResume={session.resume}
        onResumeSaved={session.resumeSaved}
        onPlay={session.play}
        onSkipForward={() => session.seekTo(Math.min(stacks.length - 1, currentIndex + 10))}
        onStop={session.stop}
        leftSlot={isFullscreen ? (
          <span className="reader-meta reader-controls-meta">
            {liveSettings.tap_to_read ? 'Tap mode' : `${wpm} wpm · ${minutesLeft} min left`}
          </span>
        ) : libraryBrowseEnabled ? (
          <ReaderBrowseToggle browsing={surfaces.browsing} onToggleBrowse={surfaces.toggleBrowse} />
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
              onLocate={textPaging.locate}
            />
          </div>
        ) : undefined}
        utilities={
          <>
            <BookmarkPopover
              open={surfaces.bookmarksOpen}
              onOpenChange={surfaces.openBookmarks}
              text={text}
              currentIndex={currentIndex}
              wordIndex={wordIndex}
              collection={bookmarks}
              goalPickDraft={surfaces.goalPickDraft}
              goalPickArmed={surfaces.goalPickArmed}
              plainTextContentRef={plainTextContentRef}
              onArmGoalPick={surfaces.armGoalPick}
              onCancelGoalPick={surfaces.leaveGoalPick}
              onSeek={session.seekTo}
              hidden={surfaces.browsing}
            />
            <QuickSettingsPopover
              embedded
              open={surfaces.quickSettingsOpen}
              onOpenChange={surfaces.openQuickSettings}
              liveSettings={liveSettings}
              onQuickSet={handleQuickSet}
              onLiveSet={handleLiveSet}
              onPersist={handlePersist}
              onBeforeRetokenize={session.beforeRetokenize}
              onSeeMoreSettings={() => surfaces.openConfigDrawer(true)}
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
        playState={playState}
      />
    </div>
  )
}
