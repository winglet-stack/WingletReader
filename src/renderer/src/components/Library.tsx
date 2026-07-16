import React, { useMemo, useState } from 'react'
import { useLibrary } from '../contexts/LibraryContext'
import { useNavigation } from '../contexts/NavigationContext'
import { useReader } from '../contexts/ReaderContext'
import TextCard from './library/TextCard'

function LibraryHeaderActions({
  importLabel,
  onImport,
}: {
  importLabel: string
  onImport: () => void
}) {
  return (
    <div className="view-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <button className="btn-brand" onClick={onImport}>{importLabel}</button>
    </div>
  )
}

export default function Library() {
  const {
    texts,
    categories,
    activeText,
    handleDelete: onDelete,
    openSegments: onSegments,
    createCategory,
    renameCategory,
    deleteCategory,
    pendingDelete,
    undoDelete,
  } = useLibrary()
  const { openLibraryCardReader: onRead } = useReader()
  const { setView } = useNavigation()
  const activeId = activeText?.id
  const onImport = () => setView('import')
  const [query, setQuery] = useState('')
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'all' | number>('all')
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [renameValues, setRenameValues] = useState<Record<number, string>>({})

  const q = query.trim().toLowerCase()
  const matching = texts.filter((t) => {
    const matchesQuery = !q || t.title.toLowerCase().includes(q)
    const matchesCategory = activeCategoryFilter === 'all' || t.category_id === activeCategoryFilter
    return matchesQuery && matchesCategory
  })
  const showResultCount = activeCategoryFilter !== 'all' || q.length > 0

  const cardProps = {
    categories,
    activeId,
    onRead,
    onDelete,
    onSegments,
  }
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  )
  const undoToast = pendingDelete && (
    <div className="library-undo-toast" role="status" aria-live="polite">
      <span>Deleted &ldquo;{pendingDelete.text.title}&rdquo;</span>
      <button type="button" onClick={undoDelete}>Undo</button>
    </div>
  )

  if (texts.length === 0) {
    return (
      <div className="view-container">
        <header className="view-header">
          <h1>Library</h1>
        </header>
        {/* Getting-started state: an empty Library defers to Import rather than
            being a dead end — the primary action takes the user straight there. */}
        <div className="empty-state library-getting-started">
          <div className="empty-icon">&#9782;</div>
          <p className="getting-started-headline">Your library is empty</p>
          <p className="empty-sub">
            Import a .txt, .docx, or .pdf file — or paste text — to start your first read.
          </p>
          <button className="btn-brand getting-started-cta" onClick={onImport}>
            Import your first text
          </button>
        </div>
        {undoToast}
      </div>
    )
  }

  return (
    <div className="view-container">
      <header className="view-header">
        <div className="library-header-meta">
          <h1>Library</h1>
          <span className="library-header-count">
            {texts.length} text{texts.length === 1 ? '' : 's'}
          </span>
        </div>
        <LibraryHeaderActions
          importLabel="+ Import Text"
          onImport={onImport}
        />
      </header>

      <div className="library-controls-card">
        <div className="library-toolbar">
          <div className="library-search">
            <span className="library-search-icon">&#9906;</span>
            <input
              type="text"
              placeholder="Search by title…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search library"
            />
          </div>
          <button
            className="btn-ghost library-manage-btn"
            onClick={() => {
              const initialRenames: Record<number, string> = {}
              for (const category of categories) initialRenames[category.id] = category.name
              setRenameValues(initialRenames)
              setShowCategoryModal(true)
            }}
          >
            Manage categories…
          </button>
        </div>

        <div className="library-category-tabs-row">
          <div className="tab-row library-category-tabs" role="tablist" aria-label="Category filters">
            <button
              role="tab"
              aria-selected={activeCategoryFilter === 'all'}
              className={`tab-btn ${activeCategoryFilter === 'all' ? 'tab-active' : ''}`}
              onClick={() => setActiveCategoryFilter('all')}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                role="tab"
                aria-selected={activeCategoryFilter === category.id}
                className={`tab-btn ${activeCategoryFilter === category.id ? 'tab-active' : ''}`}
                onClick={() => setActiveCategoryFilter(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
          {showResultCount && (
            <span className="library-category-count" role="status" aria-live="polite">
              {matching.length} result{matching.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      {q && matching.length === 0 && (
        <div className="empty-state">
          <p>No texts match &ldquo;{query}&rdquo;.</p>
          <p className="empty-sub">Try a different search or clear the filter.</p>
        </div>
      )}

      {matching.length > 0 && (
        <ul className="text-list text-list-compact" role="list">
          {matching.map((t) => (
            <TextCard
              key={t.id}
              t={t}
              {...cardProps}
            />
          ))}
        </ul>
      )}

      {showCategoryModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Manage categories"
          onClick={() => setShowCategoryModal(false)}
        >
          <div className="modal-box modal-box--wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Manage categories</h2>
            <p className="modal-sub">Deleting a category moves its texts to Uncategorized.</p>

            <div className="form-group">
              <label htmlFor="new-category" className="form-label">New category</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="new-category"
                  type="text"
                  className="form-input"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Category name"
                />
                <button
                  className="btn-secondary"
                  onClick={async () => {
                    const name = newCategoryName.trim()
                    if (!name) return
                    await createCategory(name)
                    setNewCategoryName('')
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            <div className="settings-section">
              {categories.map((category) => (
                <div key={category.id} className="settings-row">
                  <label className="settings-label">
                    {category.is_locked ? `${category.name} (locked)` : category.name}
                  </label>
                  <div className="settings-control" style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={renameValues[category.id] ?? category.name}
                      onChange={(e) =>
                        setRenameValues((prev) => ({ ...prev, [category.id]: e.target.value }))
                      }
                      disabled={Boolean(category.is_locked)}
                    />
                    <button
                      className="btn-ghost btn-small"
                      onClick={async () => {
                        const nextName = (renameValues[category.id] ?? category.name).trim()
                        if (!nextName || nextName === category.name) return
                        await renameCategory(category.id, nextName)
                      }}
                      disabled={Boolean(category.is_locked)}
                    >
                      Rename
                    </button>
                    <button
                      className="btn-ghost btn-small"
                      onClick={async () => {
                        if (category.is_locked) return
                        const fallbackName =
                          categoriesById.get(categories.find((entry) => entry.is_locked)?.id ?? 1)?.name
                            ?? 'Uncategorized'
                        if (
                          window.confirm(
                            `Delete "${category.name}"? Its texts will move to "${fallbackName}".`
                          )
                        ) {
                          await deleteCategory(category.id)
                          if (activeCategoryFilter === category.id) {
                            setActiveCategoryFilter('all')
                          }
                        }
                      }}
                      disabled={Boolean(category.is_locked)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowCategoryModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {undoToast}
    </div>
  )
}
