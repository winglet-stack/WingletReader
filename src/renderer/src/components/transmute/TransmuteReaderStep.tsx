import React, { useState } from 'react'
import type { ReaderConfig, TransmuteConfig, TransmutePreset } from '../../types'
import NumericInput from '../NumericInput'
import {
  transmutePresetMatchesConfig,
  TRANSMUTE_BPM_MAX,
  TRANSMUTE_BPM_MIN,
  TRANSMUTE_BPM_STEP,
  TRANSMUTE_WPS_MAX,
  TRANSMUTE_WPS_MIN,
  TRANSMUTE_WPS_STEP
} from '../../engine/transmuteConfig'
import { presetSaveError } from '../../engine/transmuteWizard'

interface Props {
  config: TransmuteConfig
  transmutePresets: TransmutePreset[]
  readerConfigs: ReaderConfig[]
  onUpdateConfig: (patch: Partial<TransmuteConfig>) => void
  onSelectPreset: (presetId: string) => void
  onSavePreset: (name: string) => void
  onDeletePreset: (presetId: string) => void
  onSelectReaderConfig: (configId: string) => void
  onCopyReaderSettings: () => void
  onOpenReaderSettings: () => void
  onBack: () => void
  onContinue: () => void
}

function ReaderSettingsSummary({ config }: { config: TransmuteConfig }) {
  return (
    <div className="transmute-reader-settings-summary">
      <span className="transmute-settings-chip">{config.bpm} BPM</span>
      <span className="transmute-settings-chip">
        {config.wordsPerStack} word{config.wordsPerStack !== 1 ? 's' : ''}/stack
      </span>
      <span className="transmute-settings-chip">{config.bpm * config.wordsPerStack} WPM</span>
      <span className="transmute-settings-chip">{config.fontSize}px</span>
      {config.fontFamily && <span className="transmute-settings-chip">{config.fontFamily}</span>}
      {config.linesCount > 1 && (
        <span className="transmute-settings-chip">
          {config.linesCount} rows x {config.stacksVisible} col
        </span>
      )}
    </div>
  )
}

export default function TransmuteReaderStep({
  config,
  transmutePresets,
  readerConfigs,
  onUpdateConfig,
  onSelectPreset,
  onSavePreset,
  onDeletePreset,
  onSelectReaderConfig,
  onCopyReaderSettings,
  onOpenReaderSettings,
  onBack,
  onContinue
}: Props) {
  const [presetSaveOpen, setPresetSaveOpen] = useState(false)
  const [presetSaveName, setPresetSaveName] = useState('')
  const [presetSaveErrorMsg, setPresetSaveErrorMsg] = useState('')

  function handleSavePreset() {
    const error = presetSaveError(presetSaveName, transmutePresets)
    if (error) {
      setPresetSaveErrorMsg(error)
      return
    }
    onSavePreset(presetSaveName.trim())
    closeSaveRow()
  }

  function closeSaveRow() {
    setPresetSaveOpen(false)
    setPresetSaveName('')
    setPresetSaveErrorMsg('')
  }

  return (
    <>
      <section className="transmute-section">
        <h2 className="transmute-section-title">Transmute Reader Settings</h2>
        <p className="settings-hint" style={{ marginBottom: 8 }}>
          Stored separately from the live Reader. Adjust video playback here without changing Reader settings.
        </p>
        <div className="transmute-preset-tools">
          {transmutePresets.length > 0 && (
            <div className="transmute-preset-group">
              <div className="palette-group-label">Transmute presets</div>
              <div className="palette-grid">
                {transmutePresets.map((preset) => {
                  const isActive = transmutePresetMatchesConfig(preset, config)
                  return (
                    <div key={preset.id} className="palette-chip-wrapper">
                      <button
                        type="button"
                        className={`palette-chip${isActive ? ' palette-chip--active' : ''}`}
                        title={preset.name}
                        aria-pressed={isActive}
                        onClick={() => onSelectPreset(preset.id)}
                      >
                        <div
                          className="preset-chip__preview"
                          style={{ background: preset.bgColor || undefined }}
                        >
                          <span className="preset-chip__summary">
                            {preset.resolution === '1080x1920' ? '9:16' : preset.resolution === '720x720' ? '1:1' : '16:9'}
                          </span>
                        </div>
                        <span className="palette-chip__name">{preset.name}</span>
                      </button>
                      <button
                        type="button"
                        className="palette-chip__delete"
                        title={`Delete "${preset.name}"`}
                        aria-label={`Delete transmute preset ${preset.name}`}
                        onClick={(e) => { e.stopPropagation(); onDeletePreset(preset.id) }}
                      >
                        &times;
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="palette-save-row">
            {presetSaveOpen ? (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input
                    className={`form-input${presetSaveErrorMsg ? ' form-input-error' : ''}`}
                    style={{ width: '100%' }}
                    type="text"
                    placeholder="Preset name"
                    value={presetSaveName}
                    autoFocus
                    onChange={(e) => { setPresetSaveName(e.target.value); setPresetSaveErrorMsg('') }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSavePreset()
                      if (e.key === 'Escape') closeSaveRow()
                    }}
                    maxLength={40}
                    aria-label="Transmute preset name"
                    aria-invalid={!!presetSaveErrorMsg}
                  />
                  {presetSaveErrorMsg && (
                    <p className="settings-hint" style={{ color: 'var(--error, #e55)', marginTop: '0.25rem' }}>
                      {presetSaveErrorMsg}
                    </p>
                  )}
                </div>
                <button type="button" className="btn-primary btn-small" onClick={handleSavePreset}>
                  Save
                </button>
                <button type="button" className="btn-ghost btn-small" onClick={closeSaveRow}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="btn-ghost btn-small" onClick={() => setPresetSaveOpen(true)}>
                + Save current transmute preset
              </button>
            )}
          </div>

          {readerConfigs.length > 0 && (
            <div className="transmute-preset-group">
              <div className="palette-group-label">Saved reader configurations</div>
              <div className="palette-grid">
                {readerConfigs.map((readerConfig) => (
                  <button
                    key={readerConfig.id}
                    type="button"
                    className="palette-chip"
                    title={readerConfig.name}
                    onClick={() => onSelectReaderConfig(readerConfig.id)}
                  >
                    <div
                      className="preset-chip__preview"
                      style={readerConfig.viewport_bg_color ? { background: readerConfig.viewport_bg_color } : undefined}
                    >
                      <span className="preset-chip__summary">
                        {readerConfig.bpm} BPM
                      </span>
                    </div>
                    <span className="palette-chip__name">{readerConfig.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="settings-row">
          <label htmlFor="tr-bpm" className="settings-label">
            BPM
            <span className="settings-hint">{config.bpm * config.wordsPerStack} wpm</span>
          </label>
          <div className="settings-control settings-control-wide">
            <input
              id="tr-bpm"
              type="range"
              min={TRANSMUTE_BPM_MIN}
              max={TRANSMUTE_BPM_MAX}
              step={TRANSMUTE_BPM_STEP}
              value={config.bpm}
              onChange={(e) => onUpdateConfig({ bpm: Number(e.target.value) })}
              className="range-slider"
            />
            <NumericInput
              min={TRANSMUTE_BPM_MIN}
              max={TRANSMUTE_BPM_MAX}
              step={TRANSMUTE_BPM_STEP}
              value={config.bpm}
              aria-label="Transmute BPM value"
              onCommit={(bpm) => onUpdateConfig({ bpm })}
            />
          </div>
        </div>
        <div className="settings-row">
          <label htmlFor="tr-wps" className="settings-label">
            Words per stack
            <span className="settings-hint">Up to {TRANSMUTE_WPS_MAX} for video output</span>
          </label>
          <div className="settings-control settings-control-wide">
            <input
              id="tr-wps"
              type="range"
              min={TRANSMUTE_WPS_MIN}
              max={TRANSMUTE_WPS_MAX}
              step={TRANSMUTE_WPS_STEP}
              value={config.wordsPerStack}
              onChange={(e) => onUpdateConfig({ wordsPerStack: Number(e.target.value) })}
              className="range-slider"
            />
            <NumericInput
              min={TRANSMUTE_WPS_MIN}
              max={TRANSMUTE_WPS_MAX}
              step={TRANSMUTE_WPS_STEP}
              value={config.wordsPerStack}
              aria-label="Transmute words per stack value"
              onCommit={(wordsPerStack) => onUpdateConfig({ wordsPerStack })}
            />
          </div>
        </div>
        <ReaderSettingsSummary config={config} />
        <button className="btn-ghost transmute-reader-settings-btn" onClick={onCopyReaderSettings}>
          Copy current Reader settings
        </button>
        <button className="btn-ghost transmute-reader-settings-btn" onClick={onOpenReaderSettings}>
          Open Reader Settings
        </button>
      </section>

      <div className="transmute-actions transmute-actions--split">
        <button className="btn-ghost" onClick={onBack}>
          Back to Video Output
        </button>
        <button className="btn-primary" onClick={onContinue}>
          Continue to Overview
        </button>
      </div>
    </>
  )
}
