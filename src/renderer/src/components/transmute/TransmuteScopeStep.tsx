import React from 'react'
import type { TextSegment, TransmuteConfig } from '../../types'

interface Props {
  segments: TextSegment[]
  config: TransmuteConfig
  stackCount: number
  overMaxDuration: boolean
  maxDurationInput: string
  onMaxDurationInputChange: (raw: string) => void
  onUpdateConfig: (patch: Partial<TransmuteConfig>) => void
  onContinue: () => void
}

export default function TransmuteScopeStep({
  segments,
  config,
  stackCount,
  overMaxDuration,
  maxDurationInput,
  onMaxDurationInputChange,
  onUpdateConfig,
  onContinue
}: Props) {
  return (
    <>
      {segments.length > 0 && (
        <section className="transmute-section">
          <h2 className="transmute-section-title">Scope</h2>
          <div className="transmute-pills">
            <button
              className={`theme-pill ${config.segmentId === null ? 'theme-pill-active' : ''}`}
              onClick={() => onUpdateConfig({ segmentId: null })}
            >
              Whole book
            </button>
            {segments.map((seg) => (
              <button
                key={seg.id}
                className={`theme-pill ${config.segmentId === seg.id ? 'theme-pill-active' : ''}`}
                onClick={() => onUpdateConfig({ segmentId: seg.id })}
              >
                {seg.title}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="transmute-section">
        <h2 className="transmute-section-title">Content</h2>

        <div className="settings-row">
          <label className="settings-label">
            Amount to render
            <span className="settings-hint">Limit how much of the source text is included</span>
          </label>
          <div className="settings-control">
            <div className="transmute-pills">
              {(['none', 'words', 'percentage'] as const).map((t) => (
                <button
                  key={t}
                  className={`theme-pill ${config.contentLimitType === t ? 'theme-pill-active' : ''}`}
                  onClick={() => onUpdateConfig({ contentLimitType: t })}
                >
                  {t === 'none' ? 'All' : t === 'words' ? 'Word count' : 'Percentage'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {config.contentLimitType === 'words' && (
          <div className="settings-row">
            <label htmlFor="tr-content-words" className="settings-label">
              Word count
              <span className="settings-hint">Positive integer</span>
            </label>
            <div className="settings-control">
              <input
                id="tr-content-words"
                type="number"
                className="form-input"
                min={1}
                step={1}
                value={config.contentLimitWords}
                onChange={(e) => {
                  const v = Math.max(1, Math.round(Number(e.target.value)))
                  if (!isNaN(v)) onUpdateConfig({ contentLimitWords: v })
                }}
                style={{ width: 110 }}
              />
            </div>
          </div>
        )}

        {config.contentLimitType === 'percentage' && (
          <div className="settings-row">
            <label htmlFor="tr-content-pct" className="settings-label">
              Percentage
              <span className="settings-hint">1 - 100 % of total words</span>
            </label>
            <div className="settings-control settings-control-wide">
              <input
                id="tr-content-pct"
                type="range"
                min={1} max={100} step={1}
                value={config.contentLimitPercentage}
                onChange={(e) => onUpdateConfig({ contentLimitPercentage: Number(e.target.value) })}
                className="range-slider"
              />
              <span className="range-value">{config.contentLimitPercentage}%</span>
            </div>
          </div>
        )}

        <div className="settings-row">
          <label htmlFor="tr-max-dur" className="settings-label">
            Max duration
            <span className="settings-hint">Minutes, leave blank for no limit</span>
          </label>
          <div className="settings-control">
            <input
              id="tr-max-dur"
              type="number"
              className={`form-input ${overMaxDuration ? 'form-input-error' : ''}`}
              min={0.1}
              step={0.5}
              placeholder="No limit"
              value={maxDurationInput}
              onChange={(e) => {
                const raw = e.target.value
                onMaxDurationInputChange(raw)
                const parsed = parseFloat(raw)
                onUpdateConfig({
                  maxDurationMinutes: raw === '' || isNaN(parsed) || parsed <= 0 ? null : parsed
                })
              }}
              style={{ width: 110 }}
            />
            <span className="settings-hint">min</span>
          </div>
        </div>
      </section>

      <div className="transmute-actions">
        <button
          className="btn-primary"
          onClick={onContinue}
          disabled={stackCount === 0 || overMaxDuration}
        >
          Continue to Video Output
        </button>
        {stackCount === 0 && (
          <span className="transmute-empty-hint">No content found in selection</span>
        )}
      </div>
    </>
  )
}
