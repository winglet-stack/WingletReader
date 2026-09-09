import React, { createContext, useContext } from 'react'
import type { ResumeCandidate, TextRecord, TextSegment } from '../types'
import type { SegmentContext } from '../engine/plainTextContext'
import {
  useReaderController,
  type LibraryCardReadTarget,
  type SummaryContext,
} from './reader/useReaderController'

export type { LibraryCardReadTarget, SummaryContext }

export interface ReaderContextValue {
  activeSegmentCtx: SegmentContext | undefined
  readerRereReadEnd: number | null
  readerResumeFrom: number | null
  /** A durable word offset to resume at, resolved by the Reader once it has stacks. */
  readerResumeFromWordOffset: number | null
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
  onReadingComplete,
  initialResumeFrom,
}: {
  children: React.ReactNode
  /** Override the default summary flow (used by TemporaryReaderApp). */
  onReadingComplete?: (startWordOffset: number, endWordOffset: number, endStackIndex: number) => void
  /** Pre-seed readerResumeFrom (used by TemporaryReaderApp for auto-start). */
  initialResumeFrom?: number | null
}) {
  const value: ReaderContextValue = useReaderController({ onReadingComplete, initialResumeFrom })

  return <ReaderContext.Provider value={value}>{children}</ReaderContext.Provider>
}

export function useReader(): ReaderContextValue {
  const ctx = useContext(ReaderContext)
  if (ctx === null) {
    throw new Error('useReader must be used within a ReaderProvider')
  }
  return ctx
}
