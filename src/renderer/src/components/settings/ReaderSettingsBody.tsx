import React from 'react'
import type { Settings } from '../../types'
import ReaderSettingsEditor from '../readerConfig/ReaderSettingsEditor'

interface Props {
  local: Settings
  onSave: (patch: Partial<Settings>) => void
}

// Reader defaults host (ADR-0019). Renders the two-tab `ReaderSettingsEditor`
// (Playback & Grid Layout / Display) directly — no calm-grid card landing, no
// power view. The Settings host shows the live preview toggle; edits auto-save
// (debounced).
export default function ReaderSettingsBody({ local, onSave }: Props) {
  return <ReaderSettingsEditor settings={local} onSave={onSave} showPreview />
}
