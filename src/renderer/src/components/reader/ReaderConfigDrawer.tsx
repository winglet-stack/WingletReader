import React from 'react'
import type { Settings } from '../../types'
import type { ReaderLayoutDegradationDescriptor } from '../../engine/readerLayoutSolver'
import ReaderSettingsEditor from '../readerConfig/ReaderSettingsEditor'

const PRACTICAL_READABILITY_FONT_SIZE = 8

interface ReaderStageLayoutAdvisory {
  degradation: ReaderLayoutDegradationDescriptor
  effectiveFontSize: number
}

interface ReaderConfigDrawerProps {
  open: boolean
  value: Settings
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
  layoutAdvisory?: ReaderStageLayoutAdvisory
}

function ReaderLayoutAdvisoryHint({ advisory }: { advisory?: ReaderStageLayoutAdvisory }) {
  if (advisory?.degradation.stage !== 'stage-4') return null

  const severe = advisory.effectiveFontSize < PRACTICAL_READABILITY_FONT_SIZE
  const copy = severe
    ? 'Text is not practically readable at this window size. Fewer stacks or words per stack will make it larger.'
    : 'Text is very small at this window size. Fewer stacks or words per stack will make it larger.'

  return (
    <p
      className={`reader-config-drawer__advisory${severe ? ' reader-config-drawer__advisory--severe' : ''}`}
      role="status"
    >
      {copy}
    </p>
  )
}

// In-Reader "See more settings" host (ADR-0019 / SR-4). Renders the shared
// two-tab `ReaderSettingsEditor` — the same editor as the Settings "Reader
// defaults" host — with the folding preview off (the live reader behind the
// drawer *is* the preview). The editor owns its own tab state, so the drawer no
// longer threads a `section`. `liveApply` routes each edit straight to `onChange`
// so the reader behind the drawer tracks edits in real time (no debounce lag).
export default function ReaderConfigDrawer({
  open,
  value,
  onChange,
  onClose,
  layoutAdvisory,
}: ReaderConfigDrawerProps) {
  if (!open) return null

  return (
    <aside className="reader-config-drawer" aria-label="Reader settings">
      <div className="reader-config-drawer__header">
        <div>
          <h2 className="reader-config-drawer__title">Reader settings</h2>
          <p className="reader-config-drawer__meta">Applies to this session and future Reader defaults.</p>
        </div>
        <button
          type="button"
          className="reader-config-drawer__close"
          aria-label="Close reader settings"
          onClick={onClose}
        >
          &times;
        </button>
      </div>
      <ReaderLayoutAdvisoryHint advisory={layoutAdvisory} />

      <ReaderSettingsEditor
        settings={value}
        onSave={onChange}
        showPreview={false}
        liveApply
      />
    </aside>
  )
}
