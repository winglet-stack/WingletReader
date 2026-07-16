import React, { useState } from 'react'
import type { ReaderPalette, Settings } from '../../types'
import type { ReaderSettingsSection, ReaderSettingsTab } from '../settings/readerSettingsLayout'
import ReaderSettingField from './ReaderSettingField'
import {
  PRESET_PALETTES,
  generatePaletteId,
  paletteMatchesColors,
  validatePalettes,
} from '../../engine/palettes'

const COLOR_FINE_TUNE_FIELDS = new Set([
  'text_color',
  'viewport_bg_color',
  'highlight_color',
  'highlight_text_color',
])

interface ControlsProps {
  activeTab: ReaderSettingsTab
  local: Settings
  update: (patch: Partial<Settings>) => void
  onSave: (patch: Partial<Settings>) => void
  onOpenCustomColors: () => void
  /** Settings host: live preview folds in below the descriptor-marked column. */
  previewColumnFooter?: React.ReactNode
}

/** One ordered list of metadata-driven rows. */
function ReaderSettingFieldList({
  fields,
  local,
  update,
  onSave,
}: {
  fields: readonly string[]
  local: Settings
  update: (patch: Partial<Settings>) => void
  onSave: (patch: Partial<Settings>) => void
}) {
  return (
    <>
      {fields.map((field) => (
        <ReaderSettingField key={field} field={field} local={local} update={update} onSave={onSave} />
      ))}
    </>
  )
}

function ReaderColorsSection({
  fields,
  local,
  update,
  onSave,
}: {
  fields: readonly string[]
  local: Settings
  update: (patch: Partial<Settings>) => void
  onSave: (patch: Partial<Settings>) => void
}) {
  const paletteFields = fields.filter((field) => field === 'palette')
  const otherFields = fields.filter(
    (field) => field !== 'palette' && !COLOR_FINE_TUNE_FIELDS.has(field)
  )

  return (
    <>
      <ReaderSettingFieldList fields={paletteFields} local={local} update={update} onSave={onSave} />
      <ReaderSettingFieldList fields={otherFields} local={local} update={update} onSave={onSave} />
    </>
  )
}

function ReaderCustomColorsSection({
  fields,
  local,
  update,
  onSave,
}: {
  fields: readonly string[]
  local: Settings
  update: (patch: Partial<Settings>) => void
  onSave: (patch: Partial<Settings>) => void
}) {
  return (
    <>
      <div className="rse-custom-colors-grid">
        <ReaderSettingFieldList fields={fields} local={local} update={update} onSave={onSave} />
      </div>
      <PaletteSaveCurrent local={local} onSave={onSave} />
    </>
  )
}

function PaletteSaveCurrent({
  local,
  onSave,
}: {
  local: Settings
  onSave: (patch: Partial<Settings>) => void
}) {
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState(false)
  const customPalettes = validatePalettes(local.custom_palettes)
  const currentColors = {
    viewport_bg_color: local.viewport_bg_color,
    text_color: local.text_color,
    highlight_color: local.highlight_color,
    highlight_text_color: local.highlight_text_color,
    highlight_active: local.highlight_active,
  }
  const allPalettes = [...PRESET_PALETTES, ...customPalettes]

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError(true)
      return
    }

    const palette: ReaderPalette = {
      id: generatePaletteId(),
      name: trimmed,
      ...currentColors,
    }
    onSave({ custom_palettes: [...customPalettes, palette] })
    setName('')
    setNameError(false)
  }

  return (
    <div className="palette-save-row rse-palette-save-row">
      <input
        className={`form-input${nameError ? ' form-input-error' : ''}`}
        type="text"
        placeholder="Palette name"
        value={name}
        onChange={(e) => { setName(e.target.value); setNameError(false) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') {
            setName('')
            setNameError(false)
          }
        }}
        maxLength={40}
        aria-label="Palette name"
        aria-invalid={nameError}
      />
      <button
        type="button"
        className="btn-primary btn-small"
        onClick={handleSave}
        title={
          allPalettes.some((p) => paletteMatchesColors(p, currentColors))
            ? 'Current colors already match one of your palettes'
            : 'Save current colors as a new palette'
        }
      >
        Save as palette
      </button>
    </div>
  )
}

/**
 * The active tab's control body: Tab 1 renders Playback + Grid Layout side-by-side; the Settings
 * host may fold a live preview below Grid Layout in the right column. Display uses the same
 * two-column model, stacking Text & Highlighting + Spacing on the left and Colors on the right.
 */
export default function ReaderSettingsControls({
  activeTab,
  local,
  update,
  onSave,
  onOpenCustomColors,
  previewColumnFooter,
}: ControlsProps) {
  return (
    <div className="rse-columns">
      {activeTab.columns.map((col) => {
        const footer = col.previewBelow ? previewColumnFooter : undefined
        if (col.sections.length === 0 && !footer) return null

        return (
          <div
            key={col.id}
            className={`rse-column${footer ? ' rse-preview-footer-col' : ''}`}
          >
            {col.sections.map((section) => (
              <ReaderSettingsSectionCard
                key={section.id}
                section={section}
                local={local}
                update={update}
                onSave={onSave}
                onOpenCustomColors={onOpenCustomColors}
              />
            ))}
            {footer}
          </div>
        )
      })}
    </div>
  )
}

function ReaderSettingsSectionCard({
  section,
  local,
  update,
  onSave,
  onOpenCustomColors,
}: {
  section: ReaderSettingsSection
  local: Settings
  update: (patch: Partial<Settings>) => void
  onSave: (patch: Partial<Settings>) => void
  onOpenCustomColors: () => void
}) {
  return (
    <section className="settings-section" data-rse-section={section.id}>
      {section.id === 'colors' ? (
        <div className="settings-heading-row">
          <h2 className="settings-heading">{section.label}</h2>
          <button
            type="button"
            className="btn-ghost btn-small rse-custom-colors-open"
            onClick={onOpenCustomColors}
          >
            Custom colors
          </button>
        </div>
      ) : (
        <h2 className="settings-heading">{section.label}</h2>
      )}
      {section.id === 'colors' ? (
        <ReaderColorsSection
          fields={section.fields}
          local={local}
          update={update}
          onSave={onSave}
        />
      ) : section.id === 'custom-colors' ? (
        <ReaderCustomColorsSection
          fields={section.fields}
          local={local}
          update={update}
          onSave={onSave}
        />
      ) : (
        <ReaderSettingFieldList fields={section.fields} local={local} update={update} onSave={onSave} />
      )}
    </section>
  )
}
