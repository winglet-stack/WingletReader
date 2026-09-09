import React from 'react'
import { ImportError } from '../ImportPanelParts'
import BookCard from './BookCard'
import AlphaNotice from '../AlphaNotice'
import { alphaChrome } from '../../alphaChrome'
import type { ImportBookTakeover as Takeover } from '../../hooks/useImportBookIntake'

/**
 * The structured-book takeover: while a verdict is up it owns the whole surface
 * below the header — no title field, no category picker, no cleanup preview.
 * "Pick file → one confirmation" (ADR-0033 §4, ADR-0034 §8).
 *
 * One card draws every format (`architecture-depth/05`); what it says comes off
 * the open channel, so this stays the same component for every format —
 * including the ones not written yet.
 */
export default function ImportBookTakeover({
  takeover,
  error
}: {
  takeover: Takeover
  error: string | null
}) {
  const { channel, verdict, busy, onAdd, onDismiss } = takeover
  const content = channel.describe(verdict)
  // Only the EPUB channel's confirm card gets the notice — it is where the user
  // is deciding whether to import, and a refusal card offers no add action to
  // warn ahead of. The Winglet Book channel's card is unaffected.
  const showEpubNotice = channel.id === 'epub-book' && content.kind === 'confirm'
  return (
    <>
      {showEpubNotice && (
        <AlphaNotice
          enabled={alphaChrome.epubExperimentalBannerEnabled}
          label="EPUB import experimental warning"
          style={{ marginBottom: '12px' }}
        >
          {alphaChrome.epubExperimentalBannerCopy}
        </AlphaNotice>
      )}
      <BookCard
        label={channel.label}
        content={content}
        busy={busy}
        onAdd={onAdd}
        onDismiss={onDismiss}
      />
      <ImportError error={error} />
    </>
  )
}
