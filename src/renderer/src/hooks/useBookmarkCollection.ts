import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Bookmark, BookmarkKind } from '../types'

/** A bookmark about to be written, plus the rule that may refuse it. */
export interface NewBookmarkDraft {
  kind: BookmarkKind
  wordOffset: number
  label: string
  /** Resolved before the write; a `false` verdict cancels it silently. */
  validate?: () => Promise<boolean>
}

export interface BookmarkCollection {
  bookmarks: Bookmark[]
  goalBookmark: Bookmark | null
  hasBookmarks: boolean
  saving: boolean
  deletingId: number | null
  /** The last write/delete failure, or a rule refusal a consumer recorded. */
  error: string | null
  setError: (error: string | null) => void
  /** Resolves `true` only when a bookmark was actually written. */
  createBookmark: (draft: NewBookmarkDraft) => Promise<boolean>
  deleteBookmark: (bookmark: Bookmark) => Promise<void>
  /**
   * Drop a bookmark the store has already lost — the Target that consumed itself
   * on crossing (ADR-0024). Not a delete: nothing is sent to the store.
   */
  forget: (bookmarkId: number) => void
}

export interface BookmarkCollectionOptions {
  textId: number | null | undefined
}

/** One goal at a time: a saved goal replaces the previous one in place. */
function mergeBookmark(current: Bookmark[], bookmark: Bookmark): Bookmark[] {
  return bookmark.kind === 'goal'
    ? [...current.filter((entry) => entry.kind !== 'goal'), bookmark]
    : [...current, bookmark]
}

/**
 * The bookmark list for one text: loading, creating, deleting, and the failure
 * message those raise. Knows nothing about the popover's layout or its draft.
 *
 * **The Reader owns this collection** (`architecture-depth/12`). It used to be
 * created inside the popover and pushed *up* through two change callbacks, with
 * the Reader mirroring the list and the goal into component state and pushing a
 * consumed id back *down* — a round trip that only closed with the real popover
 * mounted. Now the flow runs one way: the Reader holds the collection, the
 * scrubber and the Text view read it, the session is handed the goal, and the
 * popover is given it to render. {@link BookmarkCollection.forget} replaced the
 * consumed-id prop.
 */
export function useBookmarkCollection({ textId }: BookmarkCollectionOptions): BookmarkCollection {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const goalBookmark = useMemo(
    () => bookmarks.find((bookmark) => bookmark.kind === 'goal') ?? null,
    [bookmarks]
  )

  // Reloads from scratch whenever the text changes; an unsaved text or a
  // missing bridge simply has none.
  useEffect(() => {
    setBookmarks([])
    setError(null)
    if (textId == null || typeof window.api.db.getBookmarks !== 'function') return

    window.api.db
      .getBookmarks(textId)
      .then(setBookmarks)
      .catch(() => setBookmarks([]))
  }, [textId])

  const createBookmark = useCallback(
    async (draft: NewBookmarkDraft) => {
      if (textId == null || saving) return false

      setSaving(true)
      setError(null)
      try {
        if (typeof window.api.db.saveBookmark !== 'function') {
          throw new Error('Bookmark API unavailable')
        }
        if (draft.validate && !(await draft.validate())) return false

        const bookmark = await window.api.db.saveBookmark(textId, {
          kind: draft.kind,
          wordOffset: draft.wordOffset,
          label: draft.label,
        })
        setBookmarks((current) => mergeBookmark(current, bookmark))
        return true
      } catch {
        setError('Could not save bookmark.')
        return false
      } finally {
        setSaving(false)
      }
    },
    [saving, textId]
  )

  const deleteBookmark = useCallback(
    async (bookmark: Bookmark) => {
      if (deletingId !== null) return

      setDeletingId(bookmark.id)
      setError(null)
      try {
        if (typeof window.api.db.deleteBookmark !== 'function') {
          throw new Error('Bookmark API unavailable')
        }
        await window.api.db.deleteBookmark(bookmark.id)
        setBookmarks((current) => current.filter((entry) => entry.id !== bookmark.id))
      } catch {
        setError('Could not delete bookmark.')
      } finally {
        setDeletingId(null)
      }
    },
    [deletingId]
  )

  const forget = useCallback((bookmarkId: number) => {
    setBookmarks((current) => current.filter((entry) => entry.id !== bookmarkId))
  }, [])

  return {
    bookmarks,
    goalBookmark,
    hasBookmarks: bookmarks.length > 0,
    saving,
    deletingId,
    error,
    setError,
    createBookmark,
    deleteBookmark,
    forget,
  }
}
