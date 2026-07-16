import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ResumeCandidate, TextRecord, TextSegment } from '../types'
import type { SegmentContext } from '../engine/plainTextContext'
import { alphaChrome } from '../alphaChrome'
import { resolveWordsToStackIndex } from '../engine/readerSession'
import { buildStacks, rulesFromSettings } from '../engine/tokenizer'
import { useNavigation } from './NavigationContext'
import { useSettings } from './SettingsContext'
import { useLibrary } from './LibraryContext'

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

export interface ReaderContextValue {
  activeSegmentCtx: SegmentContext | undefined
  readerRereReadEnd: number | null
  readerResumeFrom: number | null
  readerConfigDrawerOpen: boolean
  resumeCandidate: ResumeCandidate | null
  setReaderConfigDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>
  summaryContext: SummaryContext | null
  showSummarySetup: boolean
  showSummaryPrompt: boolean
  summaryVersion: number
  readerError: string | null
  clearReaderError: () => void
  openReader: (record: TextRecord) => Promise<void>
  openLibraryCardReader: (record: TextRecord, target: LibraryCardReadTarget) => Promise<void>
  openSegmentInReader: (segment: TextSegment) => void
  openTextAtWordOffset: (record: TextRecord, wordOffset: number) => Promise<void>
  handleContinueReadingSource: () => Promise<void>
  refreshResumeCandidate: () => Promise<void>
  resumeReader: (candidate?: ResumeCandidate) => Promise<void>
  handleCreateChapterAndSummarize: (title: string) => Promise<{ ok: boolean; error?: string }>
  handleReadingComplete: (startWordOffset: number, endWordOffset: number, endStackIndex: number) => void
  handleResumeHandled: () => void
  handleSummaryReread: () => void
  handleSummarySetupConfirm: () => Promise<void>
  handleSummarySetupSkip: () => void
  handleSummarySave: (content: string) => Promise<void>
  handleSummaryExit: () => void
  handleSummaryContinue: () => void
}

const ReaderContext = createContext<ReaderContextValue | null>(null)

export function ReaderProvider({
  children,
  onReadingComplete: onReadingCompleteOverride,
  initialResumeFrom,
}: {
  children: React.ReactNode
  /** Override the default summary flow (used by TemporaryReaderApp). */
  onReadingComplete?: (startWordOffset: number, endWordOffset: number, endStackIndex: number) => void
  /** Pre-seed readerResumeFrom (used by TemporaryReaderApp for auto-start). */
  initialResumeFrom?: number | null
}) {
  const { view, setView } = useNavigation()
  const { settings, saveSettings } = useSettings()
  const { texts, activeText, segments, parentText, openSegments, setActiveText, refreshTexts } = useLibrary()

  const [activeSegmentCtx, setActiveSegmentCtx] = useState<SegmentContext | undefined>(undefined)
  const [summaryContext, setSummaryContext] = useState<SummaryContext | null>(null)
  const [showSummarySetup, setShowSummarySetup] = useState(false)
  const [showSummaryPrompt, setShowSummaryPrompt] = useState(false)
  const [summaryVersion, setSummaryVersion] = useState(0)
  const [readerRereReadEnd, setReaderRereReadEnd] = useState<number | null>(null)
  const [readerResumeFrom, setReaderResumeFrom] = useState<number | null>(initialResumeFrom ?? null)
  const [readerConfigDrawerOpen, setReaderConfigDrawerOpen] = useState(false)
  const [readerError, setReaderError] = useState<string | null>(null)
  const [resumeCandidate, setResumeCandidate] = useState<ResumeCandidate | null>(null)

  const clearReaderError = useCallback(() => setReaderError(null), [])

  const refreshResumeCandidate = useCallback(async () => {
    try {
      setResumeCandidate(await window.api.db.getLatestResumeCandidate())
    } catch {
      setResumeCandidate(null)
    }
  }, [])

  useEffect(() => {
    if (view !== 'reader') {
      setReaderConfigDrawerOpen(false)
    }
  }, [view])

  useEffect(() => {
    refreshResumeCandidate().catch(() => {})
  }, [refreshResumeCandidate, texts, view])

  const openReader = useCallback(
    async (record: TextRecord) => {
      try {
        if ((record.segment_count ?? 0) > 0) {
          await openSegments(record)
          return
        }
        const full = await window.api.db.getText(record.id!)
        if (!full) throw new Error('Text not found')
        setReaderRereReadEnd(null)
        setActiveText(full)
        setActiveSegmentCtx(undefined)
        setView('reader')
      } catch (err) {
        setReaderError(`Failed to open text: ${(err as Error).message}`)
      }
    },
    [openSegments, setActiveText, setView]
  )

  const openLibraryCardReader = useCallback(
    async (record: TextRecord, target: LibraryCardReadTarget) => {
      try {
        if (target.kind === 'segment') {
          const [segment, bookSegments] = await Promise.all([
            window.api.db.getSegment(target.segmentId),
            window.api.db.getSegments(record.id!),
          ])
          if (!segment) throw new Error('Segment not found')
          const pseudoText: TextRecord = {
            id: segment.id,
            title: segment.title,
            content: segment.content,
            word_count: segment.word_count,
          }
          setReaderRereReadEnd(null)
          setActiveText(pseudoText)
          setActiveSegmentCtx({
            sourceTitle: record.title,
            index: segment.order,
            total: bookSegments.length,
          })
          setReaderResumeFrom(target.resume ? target.stackIndex : null)
          setView('reader')
          return
        }

        const full = await window.api.db.getText(record.id!)
        if (!full) throw new Error('Text not found')
        setReaderRereReadEnd(null)
        setActiveText(full)
        setActiveSegmentCtx(undefined)
        setReaderResumeFrom(target.resume ? target.stackIndex : null)
        setView('reader')
      } catch (err) {
        setReaderError(`Failed to open text: ${(err as Error).message}`)
      }
    },
    [setActiveText, setView]
  )

  const openSegmentInReader = useCallback(
    (segment: TextSegment) => {
      const pseudoText: TextRecord = {
        id: segment.id,
        title: segment.title,
        content: segment.content,
        word_count: segment.word_count
      }
      setReaderRereReadEnd(null)
      setActiveText(pseudoText)
      setActiveSegmentCtx(
        parentText
          ? { sourceTitle: parentText.title, index: segment.order, total: segments.length }
          : undefined
      )
      setView('reader')
    },
    [parentText, segments, setActiveText, setView]
  )

  const openTextAtWordOffset = useCallback(
    async (record: TextRecord, wordOffset: number) => {
      try {
        const full = await window.api.db.getText(record.id!)
        if (!full) throw new Error('Text not found')
        const stacks = buildStacks(
          full.content ?? '',
          settings.words_per_stack,
          rulesFromSettings(settings)
        )
        const stackIndex = resolveWordsToStackIndex(wordOffset, stacks)
        setReaderRereReadEnd(null)
        setActiveText(full)
        setActiveSegmentCtx(undefined)
        setReaderResumeFrom(stackIndex)
        setView('reader')
      } catch (err) {
        setReaderError(`Failed to open bookmark: ${(err as Error).message}`)
      }
    },
    [settings, setActiveText, setView]
  )

  const handleResumeHandled = useCallback(() => {
    setReaderResumeFrom(null)
  }, [])

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
      const isSegment = parentText && segments.some((s) => s.id === activeText.id)
      const ctx: SummaryContext = {
        textId: isSegment ? parentText!.id : activeText.id!,
        textTitle: isSegment ? parentText!.title : activeText.title,
        segmentId: isSegment ? activeText.id : undefined,
        chapterTitle: isSegment ? activeText.title : undefined,
        startWordOffset,
        endWordOffset,
        endStackIndex
      }
      setSummaryContext(ctx)
      if (!settings.summaries_initialized) {
        setShowSummarySetup(true)
      } else {
        setShowSummaryPrompt(true)
      }
    },
    [onReadingCompleteOverride, activeText, parentText, segments, settings.summaries_initialized]
  )

  const handleSummarySetupConfirm = useCallback(async () => {
    setShowSummarySetup(false)
    try {
      await saveSettings({ summaries_initialized: true })
    } catch (e) {
      setReaderError(`Failed to enable summaries: ${(e as Error).message}`)
    }
    setShowSummaryPrompt(true)
  }, [saveSettings])

  const handleSummarySetupSkip = useCallback(() => {
    setShowSummarySetup(false)
    setSummaryContext(null)
  }, [])

  const handleSummaryReread = useCallback(() => {
    setShowSummaryPrompt(false)
    if (summaryContext) setReaderRereReadEnd(summaryContext.endStackIndex)
    setSummaryContext(null)
  }, [summaryContext])

  const handleSummarySave = useCallback(
    async (content: string) => {
      if (!summaryContext) return
      try {
        await window.api.db.saveSummary({
          textId: summaryContext.textId,
          segmentId: summaryContext.segmentId,
          textTitle: summaryContext.textTitle,
          chapterTitle: summaryContext.chapterTitle,
          content,
          startWordOffset: summaryContext.startWordOffset,
          endWordOffset: summaryContext.endWordOffset
        })
      } catch (e) {
        setReaderError(`Failed to save summary: ${(e as Error).message}`)
        setShowSummaryPrompt(false)
        setSummaryContext(null)
        return
      }
      setSummaryVersion((v) => v + 1)
      setShowSummaryPrompt(false)
      setSummaryContext(null)
      setReaderError('✓ Summary saved')
      setTimeout(() => setReaderError(null), 2500)
    },
    [summaryContext]
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
  }, [summaryContext])

  const handleContinueReadingSource = useCallback(async () => {
    if (!parentText) return
    try {
      const full = await window.api.db.getText(parentText.id!)
      if (!full) throw new Error('Text not found')
      const position = await window.api.db.getReadingPosition(parentText.id!)
      setActiveText(full)
      setActiveSegmentCtx(undefined)
      setReaderRereReadEnd(null)
      setReaderResumeFrom(position ? position.stackIndex : null)
      setView('reader')
    } catch (err) {
      setReaderError(`Failed to open text: ${(err as Error).message}`)
    }
  }, [parentText, setActiveText, setView])

  const resumeReader = useCallback(
    async (candidate?: ResumeCandidate) => {
      const selected = candidate ?? resumeCandidate
      if (!selected) return
      try {
        const full = await window.api.db.getText(selected.textId)
        if (!full) throw new Error('Text not found')
        setActiveText(full)
        setActiveSegmentCtx(undefined)
        setReaderRereReadEnd(null)
        setReaderResumeFrom(selected.stackIndex)
        setView('reader')
      } catch (err) {
        setReaderError(`Failed to resume text: ${(err as Error).message}`)
        refreshResumeCandidate().catch(() => {})
      }
    },
    [resumeCandidate, refreshResumeCandidate, setActiveText, setView]
  )

  const handleCreateChapterAndSummarize = useCallback(
    async (title: string): Promise<{ ok: boolean; error?: string }> => {
      if (!summaryContext) return { ok: false, error: 'No reading context.' }
      try {
        const result = await window.api.db.createChapterFromPassage(
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
    [summaryContext, refreshTexts]
  )

  const value = useMemo<ReaderContextValue>(
    () => ({
      activeSegmentCtx,
      readerRereReadEnd,
      readerResumeFrom,
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
      activeSegmentCtx, readerRereReadEnd, readerResumeFrom,
      readerConfigDrawerOpen, resumeCandidate,
      summaryContext, showSummarySetup, showSummaryPrompt, summaryVersion,
      readerError, clearReaderError,
      openReader, openLibraryCardReader, openSegmentInReader, openTextAtWordOffset, handleContinueReadingSource,
      refreshResumeCandidate, resumeReader,
      handleCreateChapterAndSummarize,
      handleReadingComplete, handleResumeHandled, handleSummaryReread,
      handleSummarySetupConfirm, handleSummarySetupSkip, handleSummarySave,
      handleSummaryExit, handleSummaryContinue,
    ]
  )

  return <ReaderContext.Provider value={value}>{children}</ReaderContext.Provider>
}

export function useReader(): ReaderContextValue {
  const ctx = useContext(ReaderContext)
  if (ctx === null) {
    throw new Error('useReader must be used within a ReaderProvider')
  }
  return ctx
}
