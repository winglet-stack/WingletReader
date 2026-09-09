import React from 'react'
import type { CategoryRecord } from '../../types'
import type { ImportTab } from '../../engine/importDraft'

/**
 * The fields of the plain-text import surface, one part per row.
 *
 * Presentation only — every part takes its value and its setter, so the form
 * that composes them stays a layout and nothing else. Markup, class names, and
 * copy are as they were in `ImportPanel`; ADR-0022 owns the styling.
 */

/** Import fields are typed into while the Reader's global shortcuts are live. */
function stopInputShortcutPropagation(
  e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
): void {
  e.stopPropagation()
}

export function ImportTitleField({
  title,
  onChange
}: {
  title: string
  onChange: (title: string) => void
}) {
  return (
    <div className="form-group">
      <label htmlFor="text-title" className="form-label">
        Title
      </label>
      <input
        id="text-title"
        type="text"
        className="form-input"
        placeholder="e.g. The Great Gatsby - Chapter 1"
        value={title}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={stopInputShortcutPropagation}
        maxLength={200}
      />
    </div>
  )
}

/** Renders nothing until the Library has categories to choose between. */
export function ImportCategoryField({
  categories,
  selectedCategoryId,
  onChange
}: {
  categories: CategoryRecord[]
  selectedCategoryId: number | undefined
  onChange: (categoryId: number) => void
}) {
  if (categories.length === 0) return null
  return (
    <div className="form-group">
      <label htmlFor="import-category" className="form-label">
        Category
      </label>
      <select
        id="import-category"
        className="form-input"
        value={selectedCategoryId}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function importTabClassName(active: boolean): string {
  return active ? 'tab-btn tab-active' : 'tab-btn'
}

export function ImportTabRow({
  tab,
  onSelect
}: {
  tab: ImportTab
  onSelect: (tab: ImportTab) => void
}) {
  return (
    <div className="tab-row" role="tablist">
      <button
        role="tab"
        aria-selected={tab === 'paste'}
        className={importTabClassName(tab === 'paste')}
        onClick={() => onSelect('paste')}
      >
        Paste Text
      </button>
      <button
        role="tab"
        aria-selected={tab === 'file'}
        className={importTabClassName(tab === 'file')}
        onClick={() => onSelect('file')}
      >
        Upload File
      </button>
    </div>
  )
}

export function ImportPasteArea({
  pastedText,
  onChange
}: {
  pastedText: string
  onChange: (text: string) => void
}) {
  return (
    <div className="form-group">
      <label htmlFor="paste-area" className="form-label">
        Paste your text below
      </label>
      <textarea
        id="paste-area"
        className="form-textarea"
        placeholder="Paste or type text here..."
        value={pastedText}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={stopInputShortcutPropagation}
        rows={16}
        spellCheck={false}
      />
    </div>
  )
}

/** The extracted text, editable before it is saved. Absent until a file loads. */
export function ImportFilePreview({
  fileContent,
  onChange
}: {
  fileContent: string | null
  onChange: (content: string) => void
}) {
  if (fileContent === null) return null
  return (
    <div className="form-group">
      <label htmlFor="file-preview-area" className="form-label">
        Review extracted text
      </label>
      <textarea
        id="file-preview-area"
        className="form-textarea"
        value={fileContent}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={stopInputShortcutPropagation}
        rows={14}
        spellCheck={false}
      />
    </div>
  )
}

/**
 * Save, plus the optional unsaved-video door. The secondary action renders only
 * when a host supplied a handler for it (PRD 5.3 / 5.8 — ADR-0009).
 */
export function ImportFormActions({
  busy,
  onSubmit,
  onCreateVideoWithoutSaving
}: {
  busy: boolean
  onSubmit: () => void
  onCreateVideoWithoutSaving?: () => void
}) {
  return (
    <div className="form-actions">
      <button className="btn-brand" onClick={onSubmit} disabled={busy}>
        Save &amp; Open in Reader
      </button>
      {onCreateVideoWithoutSaving && (
        <button className="btn-ghost" onClick={onCreateVideoWithoutSaving} disabled={busy}>
          Create Video Without Saving
        </button>
      )}
    </div>
  )
}
