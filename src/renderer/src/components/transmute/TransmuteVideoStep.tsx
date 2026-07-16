import React from 'react'
import type { TransmuteConfig } from '../../types'

interface Props {
  config: TransmuteConfig
  onUpdateConfig: (patch: Partial<TransmuteConfig>) => void
  onBack: () => void
  onContinue: () => void
}

export default function TransmuteVideoStep({ config, onUpdateConfig, onBack, onContinue }: Props) {
  return (
    <>
      <section className="transmute-section">
        <h2 className="transmute-section-title">Video Output</h2>

        <div className="settings-row">
          <label className="settings-label">
            Resolution
            <span className="settings-hint">Landscape for desktop, portrait for mobile</span>
          </label>
          <div className="settings-control">
            <div className="transmute-pills">
              {(['1280x720', '1080x1920', '720x720'] as const).map((r) => (
                <button
                  key={r}
                  className={`theme-pill ${config.resolution === r ? 'theme-pill-active' : ''}`}
                  onClick={() => onUpdateConfig({ resolution: r })}
                >
                  {r === '1280x720' ? '16:9 Landscape' : r === '1080x1920' ? '9:16 Portrait' : '1:1 Square'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-row">
          <label className="settings-label">
            Progress overlay
            <span className="settings-hint">Show percentage and progress bar on the video</span>
          </label>
          <div className="settings-control">
            <button
              className={`theme-pill ${config.showProgressOverlay ? 'theme-pill-active' : ''}`}
              onClick={() => onUpdateConfig({ showProgressOverlay: !config.showProgressOverlay })}
            >
              {config.showProgressOverlay ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        <div className="settings-row">
          <label className="settings-label">
            Transparent background
            <span className="settings-hint">Render text only, no background fill</span>
          </label>
          <div className="settings-control">
            <button
              className={`theme-pill ${config.transparentBackground ? 'theme-pill-active' : ''}`}
              onClick={() => onUpdateConfig({ transparentBackground: !config.transparentBackground })}
            >
              {config.transparentBackground ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        <div className="settings-row">
          <label htmlFor="tr-bg-color-override" className="settings-label">
            Background color
            <span className="settings-hint">Override the Reader background color for this video</span>
          </label>
          <div className="settings-control transmute-bg-color-control">
            <input
              id="tr-bg-color-override"
              type="color"
              className="transmute-color-input"
              value={config.bgColorOverride || config.bgColor}
              disabled={config.transparentBackground}
              onChange={(e) => onUpdateConfig({ bgColorOverride: e.target.value })}
              title={config.transparentBackground ? 'Disabled when transparent background is on' : undefined}
            />
            {config.bgColorOverride && !config.transparentBackground && (
              <button
                className="btn-ghost transmute-color-reset"
                onClick={() => onUpdateConfig({ bgColorOverride: '' })}
                title="Reset to Reader default"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="transmute-actions transmute-actions--split">
        <button className="btn-ghost" onClick={onBack}>
          Back to Scope and Content
        </button>
        <button className="btn-primary" onClick={onContinue}>
          Continue to Reader Settings
        </button>
      </div>
    </>
  )
}
