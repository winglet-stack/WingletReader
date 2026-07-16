import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { ImportDiagnostics, ImportedBlock } from '../../../shared/importTypes'
import { countParagraphs, countWords } from '../../../shared/importTextCleanup'

type PasteOrFileTab = 'paste' | 'file'

export interface UsePasteOrFileImportOptions {
  /** Called with the parsed file title; use functional setState to fill only when empty. */
  onFileTitle?: (fileTitle: string) => void
  /** Retain html/ext/pageCount/blocks from file.open (ImportPanel). */
  extendedFileFields?: boolean
}

function usePasteOrFileImport(options: UsePasteOrFileImportOptions = {}) {
  const { onFileTitle, extendedFileFields = false } = options

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
  }, [extendedFileFields, onFileTitle])

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
