import React from 'react'
import SettingToggleRow from '../SettingToggleRow'
import SettingsLabel from '../settings/SettingsLabel'
import { alphaChrome } from '../../alphaChrome'

/**
 * The two segmentation toggles, gated by `alphaChrome.importTextProcessingEnabled`.
 *
 * The gate is inside the section rather than at the call site because it is one
 * decision — when the chrome is off the surface has no Text Processing at all,
 * and the submit path coerces both values to `false` regardless.
 */
export default function ImportTextProcessingSection({
  segEnabled,
  onSegEnabledChange,
  chapterDetect,
  onChapterDetectChange
}: {
  segEnabled: boolean
  onSegEnabledChange: (enabled: boolean) => void
  chapterDetect: boolean
  onChapterDetectChange: (enabled: boolean) => void
}) {
  if (!alphaChrome.importTextProcessingEnabled) return null
  return (
    <section className="settings-section">
      <h2 className="settings-heading">Text Processing</h2>

      <SettingToggleRow
        label="Auto-segment long texts"
        hint="Split imported texts into chapters or parts when they exceed the threshold"
        checked={segEnabled}
        onChange={onSegEnabledChange}
      />

      <div className="settings-row">
        <SettingsLabel
          label="Auto chapter detection"
          hint="Detect headings and split at chapter/section boundaries before falling back to chunks"
        />
        <div className="settings-control">
          <label className="toggle">
            <input
              type="checkbox"
              checked={chapterDetect}
              onChange={(e) => onChapterDetectChange(e.target.checked)}
              disabled={!segEnabled}
            />
            <span className="toggle-track" />
          </label>
        </div>
      </div>
    </section>
  )
}
