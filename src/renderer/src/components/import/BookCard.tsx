import React from 'react'

/**
 * The one structured-book card (`architecture-depth/05`).
 *
 * `.wbook` (ADR-0033 §4) and `.epub` (ADR-0034 §8) shipped a card each, near
 * copies down to a shared comment about why the dismiss button does not say
 * "Cancel". They were always answering the same question — *add this book?* —
 * in the same slot, so there is one card now, and a format supplies what it
 * says rather than a component that says it.
 *
 * The content is {@link BookCardContent}, produced by the open channel's
 * `describe` (see `bookChannels.ts`). A refused file is never a dead end: every
 * verdict, of every format, has copy here.
 */

/** What the card shows for a book the ladder accepted. */
export interface BookConfirmContent {
  kind: 'confirm'
  title: string
  /** Optional line under the title — EPUB's `by <author>`, when there is one. */
  byline?: string
  /**
   * The meta line, joined with a middle dot. The chapter count leads; after it
   * comes whatever the format wants said — word count, images omitted, the
   * category the book will land in.
   */
  meta: string[]
  /** The reassuring paragraph under the meta line. */
  detail: string
}

/** What the card shows for any rung of any format's ladder short of acceptance. */
export interface BookRefusalContent {
  kind: 'refusal'
  message: string
  detail?: string
  /**
   * A damaged, foreign, oversized, or unsupported file is a failure (ADR-0012
   * `--danger`). Not everything refused is: "already in your library" is just an
   * answer, and **DRM is not damage** — the file is intact and the user did
   * nothing wrong — so both stay neutral. The tone is the format's call.
   */
  tone: 'danger' | 'neutral'
}

export type BookCardContent = BookConfirmContent | BookRefusalContent

/** The middle dot the meta line has always been joined with. */
const META_SEPARATOR = ' · '

export interface BookCardProps {
  /** The format label above the title — "Winglet Book", "EPUB Book". */
  label: string
  content: BookCardContent
  /** True while the commit IPC is in flight; disables both actions. */
  busy: boolean
  onAdd: () => void
  onDismiss: () => void
}

/**
 * The card the user confirms, or the reason they cannot. Dismissing writes
 * nothing — the commit IPC is only ever reached through {@link BookCardProps.onAdd}.
 */
export default function BookCard({ label, content, busy, onAdd, onDismiss }: BookCardProps) {
  if (content.kind === 'refusal') {
    return (
      <section className="book-card book-card--refused">
        <p className="book-card-kicker">{label}</p>
        <p
          className={`book-card-message${content.tone === 'danger' ? ' book-card-message--danger' : ''}`}
          role="alert"
        >
          {content.message}
        </p>
        {content.detail && <p className="book-card-detail">{content.detail}</p>}
        <div className="book-card-actions">
          <button className="btn-ghost" onClick={onDismiss}>
            Close
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="book-card" aria-labelledby="book-card-title">
      <p className="book-card-kicker">{label}</p>
      <h2 className="book-card-title" id="book-card-title">
        {content.title}
      </h2>
      {content.byline && <p className="book-card-byline">{content.byline}</p>}
      <p className="book-card-meta">{content.meta.join(META_SEPARATOR)}</p>
      <p className="book-card-detail">{content.detail}</p>
      <div className="book-card-actions">
        <button className="btn-brand" onClick={onAdd} disabled={busy}>
          {busy ? 'Adding…' : 'Add to Library'}
        </button>
        {/* Not "Cancel": the header already owns that word for leaving Import.
            This only puts the offered book down. */}
        <button className="btn-ghost" onClick={onDismiss} disabled={busy}>
          Not now
        </button>
      </div>
    </section>
  )
}
