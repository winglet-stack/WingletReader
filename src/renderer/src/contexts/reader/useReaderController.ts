import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { alphaChrome } from '../../alphaChrome'
import type { SegmentContext } from '../../engine/plainTextContext'
import type { AppView } from '../../appShell/routeTable'
import type {
  ResumeCandidate,
  Settings,
  TextRecord,
  TextSegment,
} from '../../types'
import { useLibrary } from '../LibraryContext'
import { useNavigation, type NavigationContextValue } from '../NavigationContext'
import { useSettings } from '../SettingsContext'

export interface SummaryContext {
  textId: number
  textTitle: string
  segmentId?: number
  chapterTitle?: string
  startWordOffset: number
  endWordOffset: number
  endStackIndex: number
}

export type LibraryCardReadTarget =
  | { kind: 'text'; stackIndex: number; resume: boolean }
  | { kind: 'segment'; segmentId: number; stackIndex: number; resume: boolean }

type ReaderDbApi = Window['api']['db']
type SetView = NavigationContextValue['setView']
type StateSetter<T> = Dispatch<SetStateAction<T>>
type SetError = StateSetter<string | null>
type ReadingCompleteHandler = (
  startWordOffset: number,
  endWordOffset: number,
  endStackIndex: number
) => void

/**
 * How a text is handed to the reader stage. `resumeFrom` is *omitted* — not
 * `null` — by the callers that must leave a pending resume position untouched
 * (`openReader`, `openSegmentInReader`), preserving their existing behavior.
 */
interface EngageOptions {
  segmentCtx?: SegmentContext
  resumeFrom?: number | null
  /**
   * Resume at a durable word offset instead of a stack index. Carried through
   * untouched and resolved by the Reader once its tokenization has arrived
   * (`architecture-depth/08`) — this context used to build the whole book's
   * Stacks here purely to convert one offset, then throw them away while
   * playback immediately rebuilt them off-thread.
   */
  resumeFromWordOffset?: number | null
}

/** A segment played on its own is engaged as a stand-in `TextRecord`. */
function pseudoTextFromSegment(segment: TextSegment): TextRecord {
  return {
    id: segment.id,
    title: segment.title,
    content: segment.content,
    word_count: segment.word_count,
  }
}

/**
 * Reading a chapter records the summary against its parent book; reading a
 * standalone text records it against the text itself.
 */
function buildSummaryContext(
  activeText: TextRecord,
  parentText: TextRecord | null,
  segments: TextSegment[],
  startWordOffset: number,
  endWordOffset: number,
  endStackIndex: number
): SummaryContext {
  const book =
    parentText && segments.some((segment) => segment.id === activeText.id) ? parentText : null
  return {
    textId: book ? book.id! : activeText.id!,
    textTitle: book ? book.title : activeText.title,
    segmentId: book ? activeText.id : undefined,
    chapterTitle: book ? activeText.title : undefined,
    startWordOffset,
    endWordOffset,
    endStackIndex,
  }
}

/** Reader chrome that is owned by the route, not by the engaged text. */
export function useReaderChrome(view: AppView) {
  const [readerConfigDrawerOpen, setReaderConfigDrawerOpen] = useState(false)
  const [readerError, setReaderError] = useState<string | null>(null)

  const clearReaderError = useCallback(() => setReaderError(null), [])

  useEffect(() => {
    if (view !== 'reader') {
      setReaderConfigDrawerOpen(false)
    }
  }, [view])

  return {
    readerConfigDrawerOpen,
    setReaderConfigDrawerOpen,
    readerError,
    setReaderError,
    clearReaderError,
  }
}

export interface ReaderEngagementDeps {
  dbApi: ReaderDbApi
  setView: SetView
  setError: SetError
  setActiveText: (text: TextRecord | null) => void
  openSegments: (record: TextRecord) => Promise<void>
  parentText: TextRecord | null
  segments: TextSegment[]
  initialResumeFrom?: number | null
}

/**
 * Every path by which a text becomes the reader's subject: library cards,
 * chapter rows, bookmarks, and the continue-reading affordance.
 */
export function useReaderEngagement({
  dbApi,
  setView,
  setError,
  setActiveText,
  openSegments,
  parentText,
  segments,
  initialResumeFrom,
}: ReaderEngagementDeps) {
  const [activeSegmentCtx, setActiveSegmentCtx] = useState<SegmentContext | undefined>(undefined)
  const [readerRereReadEnd, setReaderRereReadEnd] = useState<number | null>(null)
  const [readerResumeFrom, setReaderResumeFrom] = useState<number | null>(initialResumeFrom ?? null)
  const [readerResumeFromWordOffset, setReaderResumeFromWordOffset] = useState<number | null>(null)

  const engageText = useCallback(
    (text: TextRecord, options: EngageOptions = {}) => {
      setReaderRereReadEnd(null)
      setActiveText(text)
      setActiveSegmentCtx(options.segmentCtx)
      if (options.resumeFrom !== undefined) setReaderResumeFrom(options.resumeFrom)
      setReaderResumeFromWordOffset(options.resumeFromWordOffset ?? null)
      setView('reader')
    },
    [setActiveText, setView]
  )

  const loadText = useCallback(
    async (id: number): Promise<TextRecord> => {
      const full = await dbApi.getText(id)
      if (!full) throw new Error('Text not found')
      return full
    },
    [dbApi]
  )

  const openReader = useCallback(
    async (record: TextRecord) => {
      try {
        if ((record.segment_count ?? 0) > 0) {
          await openSegments(record)
          return
        }
        engageText(await loadText(record.id!))
      } catch (err) {
        setError(`Failed to open text: ${(err as Error).message}`)
      }
    },
    [engageText, loadText, openSegments, setError]
  )

  const openLibraryCardReader = useCallback(
    async (record: TextRecord, target: LibraryCardReadTarget) => {
      try {
        const resumeFrom = target.resume ? target.stackIndex : null
        if (target.kind === 'segment') {
          const [segment, bookSegments] = await Promise.all([
            dbApi.getSegment(target.segmentId),
            dbApi.getSegments(record.id!),
          ])
          if (!segment) throw new Error('Segment not found')
          engageText(pseudoTextFromSegment(segment), {
            segmentCtx: {
              sourceTitle: record.title,
              index: segment.order,
              total: bookSegments.length,
            },
            resumeFrom,
          })
          return
        }

        engageText(await loadText(record.id!), { resumeFrom })
      } catch (err) {
        setError(`Failed to open text: ${(err as Error).message}`)
      }
    },
    [dbApi, engageText, loadText, setError]
  )

  const openSegmentInReader = useCallback(
    (segment: TextSegment) => {
      engageText(pseudoTextFromSegment(segment), {
        segmentCtx: parentText
          ? { sourceTitle: parentText.title, index: segment.order, total: segments.length }
          : undefined,
      })
    },
    [engageText, parentText, segments]
  )

  const openTextAtWordOffset = useCallback(
    async (record: TextRecord, wordOffset: number) => {
      try {
        // The offset travels as an offset. Resolving it needs the tokenization,
        // and the Reader is about to build that anyway — off-thread — so doing
        // it here meant a whole-book synchronous walk whose only product was one
        // integer (`architecture-depth/08`).
        engageText(await loadText(record.id!), {
          resumeFrom: null,
          resumeFromWordOffset: wordOffset,
        })
      } catch (err) {
        setError(`Failed to open bookmark: ${(err as Error).message}`)
      }
    },
    [engageText, loadText, setError]
  )

  const handleContinueReadingSource = useCallback(async () => {
    if (!parentText) return
    try {
      const full = await loadText(parentText.id!)
      const position = await dbApi.getReadingPosition(parentText.id!)
      engageText(full, { resumeFrom: position ? position.stackIndex : null })
    } catch (err) {
      setError(`Failed to open text: ${(err as Error).message}`)
    }
  }, [dbApi, engageText, loadText, parentText, setError])

  const handleResumeHandled = useCallback(() => {
    setReaderResumeFrom(null)
  }, [])

  return {
    activeSegmentCtx,
    readerRereReadEnd,
    setReaderRereReadEnd,
    readerResumeFrom,
    setReaderResumeFrom,
    readerResumeFromWordOffset,
    engageText,
    loadText,
    openReader,
    openLibraryCardReader,
    openSegmentInReader,
    openTextAtWordOffset,
    handleContinueReadingSource,
    handleResumeHandled,
  }
}

export interface ReaderResumeDeps {
  dbApi: ReaderDbApi
  texts: TextRecord[]
  view: AppView
  setError: SetError
  engageText: (text: TextRecord, options?: EngageOptions) => void
  loadText: (id: number) => Promise<TextRecord>
}

/** The global "resume where you left off" candidate and the jump into it. */
export function useReaderResume({
  dbApi,
  texts,
  view,
  setError,
  engageText,
  loadText,
}: ReaderResumeDeps) {
  const [resumeCandidate, setResumeCandidate] = useState<ResumeCandidate | null>(null)

  const refreshResumeCandidate = useCallback(async () => {
    try {
      setResumeCandidate(await dbApi.getLatestResumeCandidate())
    } catch {
      setResumeCandidate(null)
    }
  }, [dbApi])

  useEffect(() => {
    refreshResumeCandidate().catch(() => {})
  }, [refreshResumeCandidate, texts, view])

  const resumeReader = useCallback(
    async (candidate?: ResumeCandidate) => {
      const selected = candidate ?? resumeCandidate
      if (!selected) return
      try {
        engageText(await loadText(selected.textId), { resumeFrom: selected.stackIndex })
      } catch (err) {
        setError(`Failed to resume text: ${(err as Error).message}`)
        refreshResumeCandidate().catch(() => {})
      }
    },
    [engageText, loadText, refreshResumeCandidate, resumeCandidate, setError]
  )

  return { resumeCandidate, refreshResumeCandidate, resumeReader }
}

export interface PostReadingSummaryDeps {
  dbApi: ReaderDbApi
  activeText: TextRecord | null
  parentText: TextRecord | null
  segments: TextSegment[]
  summariesInitialized: boolean
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  refreshTexts: () => Promise<void>
  setError: SetError
  setReaderRereReadEnd: StateSetter<number | null>
  setReaderResumeFrom: StateSetter<number | null>
  onReadingCompleteOverride?: ReadingCompleteHandler
}

/**
 * The Reader-owned post-reading setup/prompt/save flow. Disabled for alpha v1
 * behind `alphaChrome.postReadingSummaryEnabled` — the flag is checked *after*
 * the session-state reset so ending a session behaves identically either way.
 */
export function usePostReadingSummary({
  dbApi,
  activeText,
  parentText,
  segments,
  summariesInitialized,
  saveSettings,
  refreshTexts,
  setError,
  setReaderRereReadEnd,
  setReaderResumeFrom,
  onReadingCompleteOverride,
}: PostReadingSummaryDeps) {
  const [summaryContext, setSummaryContext] = useState<SummaryContext | null>(null)
  const [showSummarySetup, setShowSummarySetup] = useState(false)
  const [showSummaryPrompt, setShowSummaryPrompt] = useState(false)
  const [summaryVersion, setSummaryVersion] = useState(0)

  const handleReadingComplete = useCallback(
    (startWordOffset: number, endWordOffset: number, endStackIndex: number) => {
      if (onReadingCompleteOverride) {
        onReadingCompleteOverride(startWordOffset, endWordOffset, endStackIndex)
        return
      }
      if (!activeText) return
      setReaderRereReadEnd(null)
      setReaderResumeFrom(null)
      if (!alphaChrome.postReadingSummaryEnabled) return
      setSummaryContext(
        buildSummaryContext(
          activeText,
          parentText,
          segments,
          startWordOffset,
          endWordOffset,
          endStackIndex
        )
      )
      if (!summariesInitialized) {
        setShowSummarySetup(true)
      } else {
        setShowSummaryPrompt(true)
      }
    },
    [
      activeText,
      onReadingCompleteOverride,
      parentText,
      segments,
      setReaderRereReadEnd,
      setReaderResumeFrom,
      summariesInitialized,
    ]
  )

  const handleSummarySetupConfirm = useCallback(async () => {
    setShowSummarySetup(false)
    try {
      await saveSettings({ summaries_initialized: true })
    } catch (e) {
      setError(`Failed to enable summaries: ${(e as Error).message}`)
    }
    setShowSummaryPrompt(true)
  }, [saveSettings, setError])

  const handleSummarySetupSkip = useCallback(() => {
    setShowSummarySetup(false)
    setSummaryContext(null)
  }, [])

  const handleSummaryReread = useCallback(() => {
    setShowSummaryPrompt(false)
    if (summaryContext) setReaderRereReadEnd(summaryContext.endStackIndex)
    setSummaryContext(null)
  }, [setReaderRereReadEnd, summaryContext])

  const handleSummarySave = useCallback(
    async (content: string) => {
      if (!summaryContext) return
      try {
        await dbApi.saveSummary({
          textId: summaryContext.textId,
          segmentId: summaryContext.segmentId,
          textTitle: summaryContext.textTitle,
          chapterTitle: summaryContext.chapterTitle,
          content,
          startWordOffset: summaryContext.startWordOffset,
          endWordOffset: summaryContext.endWordOffset,
        })
      } catch (e) {
        setError(`Failed to save summary: ${(e as Error).message}`)
        setShowSummaryPrompt(false)
        setSummaryContext(null)
        return
      }
      setSummaryVersion((v) => v + 1)
      setShowSummaryPrompt(false)
      setSummaryContext(null)
      setError('✓ Summary saved')
      setTimeout(() => setError(null), 2500)
    },
    [dbApi, setError, summaryContext]
  )

  const handleSummaryExit = useCallback(() => {
    setShowSummaryPrompt(false)
    setSummaryContext(null)
  }, [])

  const handleSummaryContinue = useCallback(() => {
    if (!summaryContext) return
    setShowSummaryPrompt(false)
    setReaderResumeFrom(summaryContext.endStackIndex)
    setSummaryContext(null)
  }, [setReaderResumeFrom, summaryContext])

  const handleCreateChapterAndSummarize = useCallback(
    async (title: string): Promise<{ ok: boolean; error?: string }> => {
      if (!summaryContext) return { ok: false, error: 'No reading context.' }
      try {
        const result = await dbApi.createChapterFromPassage(
          summaryContext.textId,
          summaryContext.startWordOffset,
          summaryContext.endWordOffset,
          title
        )
        if (!result.ok) return { ok: false, error: result.error }
        setSummaryContext((prev) =>
          prev ? { ...prev, segmentId: result.segment.id, chapterTitle: title } : null
        )
        refreshTexts().catch(() => {})
        return { ok: true }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
    [dbApi, refreshTexts, summaryContext]
  )

  return {
    summaryContext,
    showSummarySetup,
    showSummaryPrompt,
    summaryVersion,
    handleReadingComplete,
    handleSummarySetupConfirm,
    handleSummarySetupSkip,
    handleSummaryReread,
    handleSummarySave,
    handleSummaryExit,
    handleSummaryContinue,
    handleCreateChapterAndSummarize,
  }
}

export interface ReaderControllerOptions {
  /** Override the default summary flow (used by TemporaryReaderApp). */
  onReadingComplete?: ReadingCompleteHandler
  /** Pre-seed readerResumeFrom (used by TemporaryReaderApp for auto-start). */
  initialResumeFrom?: number | null
}

export function useReaderController({
  onReadingComplete: onReadingCompleteOverride,
  initialResumeFrom,
}: ReaderControllerOptions = {}) {
  const { view, setView } = useNavigation()
  const { settings, saveSettings } = useSettings()
  const { texts, activeText, segments, parentText, openSegments, setActiveText, refreshTexts } =
    useLibrary()
  const dbApi = window.api.db

  const chrome = useReaderChrome(view)
  const engagement = useReaderEngagement({
    dbApi,
    setView,
    setError: chrome.setReaderError,
    setActiveText,
    openSegments,
    parentText,
    segments,
    initialResumeFrom,
  })
  const resume = useReaderResume({
    dbApi,
    texts,
    view,
    setError: chrome.setReaderError,
    engageText: engagement.engageText,
    loadText: engagement.loadText,
  })
  const summary = usePostReadingSummary({
    dbApi,
    activeText,
    parentText,
    segments,
    summariesInitialized: settings.summaries_initialized,
    saveSettings,
    refreshTexts,
    setError: chrome.setReaderError,
    setReaderRereReadEnd: engagement.setReaderRereReadEnd,
    setReaderResumeFrom: engagement.setReaderResumeFrom,
    onReadingCompleteOverride,
  })

  const {
    activeSegmentCtx,
    readerRereReadEnd,
    readerResumeFrom,
    readerResumeFromWordOffset,
    openReader,
    openLibraryCardReader,
    openSegmentInReader,
    openTextAtWordOffset,
    handleContinueReadingSource,
    handleResumeHandled,
  } = engagement
  const { readerConfigDrawerOpen, setReaderConfigDrawerOpen, readerError, clearReaderError } = chrome
  const { resumeCandidate, refreshResumeCandidate, resumeReader } = resume
  const {
    summaryContext,
    showSummarySetup,
    showSummaryPrompt,
    summaryVersion,
    handleCreateChapterAndSummarize,
    handleReadingComplete,
    handleSummaryReread,
    handleSummarySetupConfirm,
    handleSummarySetupSkip,
    handleSummarySave,
    handleSummaryExit,
    handleSummaryContinue,
  } = summary

  return useMemo(
    () => ({
      activeSegmentCtx,
      readerRereReadEnd,
      readerResumeFrom,
      readerResumeFromWordOffset,
      readerConfigDrawerOpen,
      resumeCandidate,
      setReaderConfigDrawerOpen,
      summaryContext,
      showSummarySetup,
      showSummaryPrompt,
      summaryVersion,
      readerError,
      clearReaderError,
      openReader,
      openLibraryCardReader,
      openSegmentInReader,
      openTextAtWordOffset,
      handleContinueReadingSource,
      refreshResumeCandidate,
      resumeReader,
      handleCreateChapterAndSummarize,
      handleReadingComplete,
      handleResumeHandled,
      handleSummaryReread,
      handleSummarySetupConfirm,
      handleSummarySetupSkip,
      handleSummarySave,
      handleSummaryExit,
      handleSummaryContinue,
    }),
    [
      activeSegmentCtx, readerRereReadEnd, readerResumeFrom, readerResumeFromWordOffset,
      readerConfigDrawerOpen, resumeCandidate, setReaderConfigDrawerOpen,
      summaryContext, showSummarySetup, showSummaryPrompt, summaryVersion,
      readerError, clearReaderError,
      openReader, openLibraryCardReader, openSegmentInReader, openTextAtWordOffset,
      handleContinueReadingSource,
      refreshResumeCandidate, resumeReader,
      handleCreateChapterAndSummarize,
      handleReadingComplete, handleResumeHandled, handleSummaryReread,
      handleSummarySetupConfirm, handleSummarySetupSkip, handleSummarySave,
      handleSummaryExit, handleSummaryContinue,
    ]
  )
}
