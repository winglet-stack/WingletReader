import React from 'react'
import type { ImportDiagnostics } from '../../../shared/importTypes'

/** Drop zone / file affordance for the Upload File tab. Native DnD for file paths
 *  isn't available in the Electron renderer, so this is a visual affordance that
 *  triggers the file open dialog. */
export function ImportDropZone({
  fileName,
  fileContent,
  wordCount,
  busy,
  dragging,
  dropRef,
  onOpen,
  onDrop,
  setDragging
}: {
  fileName: string | null
  fileContent: string | null
  wordCount: number
  busy: boolean
  dragging: boolean
  dropRef: React.RefObject<HTMLDivElement>
  onOpen: () => void
  onDrop: (e: React.DragEvent) => void
  setDragging: (dragging: boolean) => void
}) {
  return (
    <div
      ref={dropRef}
      className={`drop-zone ${dragging ? 'drop-zone-active' : ''} ${fileContent ? 'drop-zone-loaded' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      aria-label="Drop file here or click to browse"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen()
      }}
      onClick={onOpen}
    >
      {fileContent ? (
        <>
          <div className="drop-icon">&#9989;</div>
          <p className="drop-filename">{fileName}</p>
          <p className="drop-hint">{wordCount.toLocaleString()} words extracted</p>
          <button
            className="btn-ghost btn-small"
            onClick={(e) => {
              e.stopPropagation()
              onOpen()
            }}
          >
            Replace file
          </button>
        </>
      ) : (
        <>
          <div className="drop-icon">&#8682;</div>
          <p className="drop-hint">
            {busy ? 'Opening…' : 'Click or drag to load a .txt, .docx, or .pdf file'}
          </p>
        </>
      )}
    </div>
  )
}

/** Import warnings surfaced by the file parser. Renders nothing when empty. */
export function ImportWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="warnings-box" role="status">
      <strong>Warnings:</strong>
      <ul>
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  )
}

/** Parser/cleanup diagnostics for a loaded file. Renders nothing without diagnostics. */
export function ImportDiagnosticsBox({ diagnostics }: { diagnostics: ImportDiagnostics | null }) {
  if (!diagnostics) return null
  return (
    <div className="warnings-box" role="status">
      <strong>Import diagnostics:</strong>
      <ul>
        <li>Parser: {diagnostics.parser}</li>
        <li>
          {diagnostics.wordCount.toLocaleString()} words, {diagnostics.paragraphCount.toLocaleString()} paragraphs
          {diagnostics.pageCount ? `, ${diagnostics.pageCount.toLocaleString()} pages` : ''}
        </li>
        {diagnostics.cleanupActions.length > 0 && (
          <li>
            Cleanup: {diagnostics.cleanupActions.map((a) => `${a.type} (${a.count})`).join(', ')}
          </li>
        )}
      </ul>
    </div>
  )
}

/** Word/paragraph/page summary line under the input. Renders nothing at zero words. */
export function ImportStats({
  wordCount,
  paragraphCount,
  pageCount
}: {
  wordCount: number
  paragraphCount: number
  pageCount?: number
}) {
  if (wordCount === 0) return null
  return (
    <p className="word-count-hint">
      {wordCount.toLocaleString()} words &middot; ~{Math.ceil(wordCount / 200)} min at 200 wpm
      {paragraphCount > 0 && <> &middot; {paragraphCount.toLocaleString()} paragraphs</>}
      {pageCount && <> &middot; {pageCount.toLocaleString()} pages</>}
    </p>
  )
}
