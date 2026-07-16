import React from 'react'
import type { Settings } from '../../types'
import ChunkingSettingsTab from './ChunkingSettingsTab'
import PortableDriveSection from './PortableDriveSection'
import { useNavigation } from '../../contexts/NavigationContext'
import ChromeIcon, { type ChromeIconName } from '../icons/ChromeIcon'

interface Props {
  local: Settings
  update: (patch: Partial<Settings>) => void
  onExport: () => void
  onImport: () => void
  /** Open the full-page Reader defaults editor (handled by SettingsPanel). */
  onOpenReaderDefaults: () => void
}

// General settings landing: a uniform 5-card grid (Appearance, Reader defaults,
// Read While Working, Import, Data) in the shared calm-grid language. Each card
// is a centered column: glyph, title, and a one-line description.
export default function GlobalSettingsBody({
  local,
  update,
  onExport,
  onImport,
  onOpenReaderDefaults
}: Props) {
  const { settingsSubview, setSettingsSubview } = useNavigation()
  const openSection = settingsSubview === 'import' || settingsSubview === 'data'
    ? settingsSubview
    : null

  if (openSection) {
    return (
      <>
        {openSection === 'import' && (
          <>
            <section className="settings-section">
              <h2 className="settings-heading">Import</h2>
              <p className="settings-hint" style={{ marginBottom: '1rem' }}>
                Restore all texts and settings from a previously exported JSON backup.
              </p>
              <button className="btn-secondary" onClick={onImport}>
                ⇧ Import from JSON
              </button>
            </section>
            <ChunkingSettingsTab local={local} update={update} />
          </>
        )}

        {openSection === 'data' && (
          <>
            <section className="settings-section">
              <h2 className="settings-heading">Data</h2>
              <p className="settings-hint" style={{ marginBottom: '1rem' }}>
                Export all texts and settings to a JSON file you can back up or move
                to another machine.
              </p>
              <button className="btn-secondary" onClick={onExport}>
                ⇩ Export all data
              </button>
            </section>
            <section className="settings-section">
              <h2 className="settings-heading">Portable drive</h2>
              <PortableDriveSection />
            </section>
          </>
        )}
      </>
    )
  }

  return (
    <div className="rdc-grid" role="group" aria-label="Settings sections">
      {/* Appearance carries its single control (theme) inline rather than
          drilling in — the pills take the place of the description line. */}
      <div className="rdc-card gsc-card gsc-card--static" role="group" aria-label="Appearance">
        <div className="gsc-glyph" aria-hidden="true">
          <ChromeIcon name="appearance" />
        </div>
        <div className="rdc-card-body">
          <div className="settings-control settings-control-row gsc-theme-row">
            {(['dark', 'light'] as const).map((t) => (
              <button
                key={t}
                className={`theme-pill${local.theme === t ? ' theme-pill-active' : ''}`}
                onClick={() => update({ theme: t })}
              >
                {t === 'dark' ? '◐ Dark' : '○ Light'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <GatewayCard
        icon="reader-defaults"
        label="Reader defaults"
        desc="Playback · Grid · Text · Colors · Spacing"
        ariaLabel="Edit Reader defaults"
        onClick={onOpenReaderDefaults}
      />
      <GatewayCard
        icon="overlay-reader"
        label="Overlay Reader"
        desc="Overlay · shortcuts · reader settings"
        ariaLabel="Open Overlay Reader settings"
        onClick={() => setSettingsSubview('overlay-reader')}
      />
      <GatewayCard
        icon="import"
        label="Import"
        desc="Restore from backup · chunking rules"
        ariaLabel="Open Import settings"
        onClick={() => setSettingsSubview('import')}
      />
      <GatewayCard
        icon="data"
        label="Data"
        desc="Export all texts and settings to JSON"
        ariaLabel="Open Data settings"
        onClick={() => setSettingsSubview('data')}
      />
    </div>
  )
}

/** One landing-grid gateway: glyph badge, centered title, one-line description.
 *  Identical markup for every card so the grid stays uniform. */
function GatewayCard({
  icon,
  label,
  desc,
  ariaLabel,
  onClick,
  disabled
}: {
  icon: ChromeIconName
  label: string
  desc: string
  ariaLabel: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      className="rdc-card gsc-card"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <div className="gsc-glyph" aria-hidden="true">
        <ChromeIcon name={icon} />
      </div>
      <div className="rdc-card-body">
        <span className="rdc-card-label" role="heading" aria-level={2}>
          {label}
        </span>
        <span className="rdc-card-desc">{desc}</span>
      </div>
    </button>
  )
}
