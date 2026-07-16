import type { Settings } from '../types'
import ReaderPreview from './ReaderPreview'
import ReaderConfigEditorCore from './readerConfig/ReaderConfigEditorCore'
import { useReaderConfigDraft, flushOnNumericBlur } from './readerConfig/useReaderConfigDraft'

interface Props {
  settings: Settings
  onSave: (updated: Partial<Settings>) => void
}

// Flat reader-config editor: every section stacked over a sticky live preview.
// Still the editor for the transmute + RWW entry paths; the Reader-defaults
// surface uses the two-tab `ReaderSettingsEditor` (ADR-0019) instead. The
// debounced-save plumbing is shared via `useReaderConfigDraft`.
export default function ReaderConfigPanel({ settings, onSave }: Props) {
  const { local, update, flushPendingSave } = useReaderConfigDraft(settings, onSave)

  return (
    <div
      className="rcp-layout"
      onBlurCapture={(e) => flushOnNumericBlur(e, flushPendingSave)}
    >
      {/* ── Left column: settings ────────────────────────────────────────── */}
      <ReaderConfigEditorCore value={local} onChange={update} />

      {/* ── Right column: live preview ───────────────────────────────────── */}
      <div className="rcp-preview-col">
        <ReaderPreview settings={local} />
      </div>
    </div>
  )
}
