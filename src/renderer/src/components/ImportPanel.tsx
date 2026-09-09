import React from 'react'
import { useImportPanelController, type ImportPanelProps } from '../hooks/useImportPanelController'
import { ImportSurfaceHeader } from './ImportPanelParts'
import ImportBookTakeover from './import/ImportBookTakeover'
import PlainImportForm from './import/PlainImportForm'
import type { ImportMeta, ImportProcessingSettings } from '../engine/importPlan'

export type { ImportMeta, ImportProcessingSettings }

/**
 * The Import surface, as a composition point.
 *
 * Two things can hold it: the ordinary plain-text form, and a structured book's
 * confirm card. The second is not a per-format branch — a picked `.wbook` or
 * `.epub` resolves through the channel registry to a card/handler pair, so this
 * component selects between "a book is offered" and "no book is offered" and
 * never between formats (see `components/import/bookChannels.ts`).
 *
 * All state and every decision live in `useImportPanelController`.
 */
export default function ImportPanel(props: ImportPanelProps) {
  const { onCancel, error, takeover, form } = useImportPanelController(props)

  return (
    <div className="view-container">
      <ImportSurfaceHeader onCancel={onCancel} />
      {takeover ? (
        <ImportBookTakeover takeover={takeover} error={error} />
      ) : (
        <PlainImportForm {...form} error={error} />
      )}
    </div>
  )
}
