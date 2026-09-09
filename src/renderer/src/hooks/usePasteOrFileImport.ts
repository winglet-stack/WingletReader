import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { ImportDiagnostics, ImportedBlock } from '../../../shared/importTypes'
import { countParagraphs, countWords } from '../../../shared/importTextCleanup'

type PasteOrFileTab = 'paste' | 'file'

export interface UsePasteOrFileImportOptions {
  /** Called with the parsed file title; use functional setState to fill only when empty. */
  onFileTitle?: (fileTitle: string) => void
  /** Retain html/ext/pageCount/blocks from file.open (ImportPanel). */
  extendedFileFields?: boolean
  /**
   * Handles a picked `.wbook` (ADR-0033). The file never reaches the paste/file
   * text state — a Winglet Book carries its own curated answers and skips the
   * cleanup/preview flow entirely — so a host that has nowhere to put a whole
   * book simply omits this and gets {@link WINGLET_BOOK_NOT_A_CHAPTER}.
   */
  onWingletBook?: (picked: { filePath: string; fileName: string }) => void | Promise<void>
  /**
   * Handles a picked `.epub` (ADR-0034 §8) — the same door as
   * {@link onWingletBook}: a publisher book carries its own structure and skips
   * the cleanup/preview flow, so the file never reaches the paste/file text
   * state. A host that omits this cannot take a whole book and refuses the pick
   * with {@link EPUB_BOOK_NOT_A_CHAPTER}.
   */
  onEpubBook?: (picked: { filePath: string; fileName: string }) => void | Promise<void>
}

/**
 * Shown when a Winglet Book is picked in a host that imports *part* of a text.
 * A curated book is a whole library entry with its own chapters; loading its
 * JSON as chapter prose would be nonsense, so the pick is refused with a
 * pointer to the surface that can take it.
 */
export const WINGLET_BOOK_NOT_A_CHAPTER =
  'That is a Winglet Book — a complete book, not a single content. Add it from Import instead.'

/**
 * The {@link WINGLET_BOOK_NOT_A_CHAPTER} sibling for `.epub` (ADR-0034 §8). An
 * EPUB arrives with the publisher's own chapters already resolved; appending one
 * as a single content would throw that structure away, so the pick is refused
 * with the same pointer to the surface that can take a whole book.
 */
export const EPUB_BOOK_NOT_A_CHAPTER =
  'That is an EPUB — a whole book, not a chapter. Add it from Import instead.'

function usePasteOrFileImport(options: UsePasteOrFileImportOptions = {}) {
  const { onFileTitle, extendedFileFields = false, onWingletBook, onEpubBook } = options

  const [tab, setTab] = useState<PasteOrFileTab>('paste')
  const [pastedText, setPastedText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileDiagnostics, setFileDiagnostics] = useState<ImportDiagnostics | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  const [fileHtml, setFileHtml] = useState<string | null>(null)
  const [fileExt, setFileExt] = useState<string | null>(null)
  const [filePageCount, setFilePageCount] = useState<number | undefined>(undefined)
  const [fileBlocks, setFileBlocks] = useState<ImportedBlock[] | undefined>(undefined)

  const openFile = useCallback(async () => {
    setBusy(true)
    setError(null)
    setWarnings([])
    try {
      const result = await window.api.file.open()
      if (!result) return
      if (result.kind === 'winglet-book') {
        if (!onWingletBook) {
          setError(WINGLET_BOOK_NOT_A_CHAPTER)
          return
        }
        // Awaited inside the try so `busy` still covers the parse round-trip.
        await onWingletBook({ filePath: result.filePath, fileName: result.fileName })
        return
      }
      if (result.kind === 'epub-book') {
        // No handler = no surface for a whole book here. The picked EPUB is
        // never fed to the text-file branch (which has no `content` to read) and
        // the host says why, the `.wbook` way.
        if (!onEpubBook) {
          setError(EPUB_BOOK_NOT_A_CHAPTER)
          return
        }
        await onEpubBook({ filePath: result.filePath, fileName: result.fileName })
        return
      }
      setFileName(result.fileName)
      setFileContent(result.content)
      setFileDiagnostics(result.diagnostics ?? null)
      setWarnings(result.warnings)
      if (extendedFileFields) {
        setFileHtml(result.html ?? null)
        setFileExt(result.ext ?? null)
        setFilePageCount(result.pageCount)
        setFileBlocks(result.blocks)
      }
      if (onFileTitle && result.title) {
        onFileTitle(result.title)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }, [extendedFileFields, onFileTitle, onWingletBook, onEpubBook])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      void openFile()
    },
    [openFile]
  )

  const activeContent = tab === 'paste' ? pastedText : fileContent ?? ''
  const wordCount = countWords(activeContent)
  const paragraphCount = countParagraphs(activeContent)

  return {
    tab,
    setTab,
    pastedText,
    setPastedText,
    fileName,
    fileContent,
    setFileContent,
    fileDiagnostics,
    warnings,
    error,
    setError,
    busy,
    dragging,
    setDragging,
    dropRef,
    openFile,
    handleDrop,
    activeContent,
    wordCount,
    paragraphCount,
    fileHtml,
    fileExt,
    filePageCount,
    fileBlocks,
  }
}

/** Shared paste/file hook wiring with the common "fill title when empty" callback. */
export function usePasteOrFileImportWithAutoTitle(
  setTitle: Dispatch<SetStateAction<string>>,
  options: Omit<UsePasteOrFileImportOptions, 'onFileTitle'> = {}
) {
  const fillTitleFromFile = useCallback(
    (fileTitle: string) => setTitle((current) => current || fileTitle),
    [setTitle]
  )
  return usePasteOrFileImport({ ...options, onFileTitle: fillTitleFromFile })
}
