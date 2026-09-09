import { cleanupImportedText, countWords } from '../../../shared/importTextCleanup'
import type { CleanupResult } from '../../../shared/importTextCleanup'

/** Which half of the plain-text import surface the draft is being taken from. */
export type ImportTab = 'paste' | 'file'

export interface ImportDraftInput {
  tab: ImportTab
  title: string
  /** The paste box or the file preview, whichever tab is active; `null` = no file loaded. */
  activeContent: string | null
}

/**
 * The submit guards resolved to a decision. `ok: false` carries the exact copy
 * the surface shows — the messages are product voice, so they live with the
 * decision rather than being re-worded at each call site.
 */
export type ImportDraftValidation =
  | {
      ok: true
      resolvedTitle: string
      contentToSave: string
      activeContent: string
      cleaned: CleanupResult
    }
  | { ok: false; error: string }

/**
 * Pure form of the three Import guards — a title, some content, and at least
 * three words — run against the already-cleaned content, since the cleanup is
 * what decides whether anything survives.
 *
 * The order is the order the user sees: the *first* failing guard is the
 * message, and "no content" is worded per tab because an empty paste box and an
 * unloaded file are different mistakes.
 *
 * Companion to {@link ../engine/importPlan.planImportMeta}: this one carries the
 * guards, that one carries the meta decision. Neither touches error state — the
 * surface still owns that.
 */
export function validateImportDraft({
  tab,
  title,
  activeContent
}: ImportDraftInput): ImportDraftValidation {
  const raw = activeContent ?? ''
  const resolvedTitle = title.trim()
  const cleaned = cleanupImportedText(raw, { preservePageMarkers: true })
  const contentToSave = cleaned.content.trim()

  if (!resolvedTitle) {
    return { ok: false, error: 'Please enter a title.' }
  }
  if (!contentToSave) {
    return { ok: false, error: tab === 'paste' ? 'Please paste some text.' : 'No file loaded.' }
  }
  if (countWords(contentToSave) < 3) {
    return { ok: false, error: 'Text is too short (needs at least 3 words).' }
  }
  return { ok: true, resolvedTitle, contentToSave, activeContent: raw, cleaned }
}
