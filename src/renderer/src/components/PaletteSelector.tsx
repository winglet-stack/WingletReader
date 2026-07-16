import React from 'react'
import type { ReaderPalette } from '../types'
import type { PaletteColorFields } from '../engine/palettes'
import { paletteMatchesColors } from '../engine/palettes'

interface Props {
  presets: ReaderPalette[]
  custom: ReaderPalette[]
  currentColors: PaletteColorFields
  theme: 'dark' | 'light'
  onSelect: (palette: ReaderPalette) => void
  onDelete: (id: string) => void
}

interface ChipProps {
  palette: ReaderPalette
  isActive: boolean
  theme: 'dark' | 'light'
  showDelete?: boolean
  onSelect: () => void
  onDelete?: () => void
}

function PaletteChip({ palette, isActive, theme, showDelete, onSelect, onDelete }: ChipProps) {
  const defaultBg = theme === 'dark' ? '#0d0d0d' : '#f8f6f2'
  const defaultText = theme === 'dark' ? '#f0f0f0' : '#1a1a1a'
  const defaultHl = theme === 'dark' ? '#f0f0f0' : '#1a1a1a'

  const bg = palette.viewport_bg_color || defaultBg
  const textColor = palette.text_color || defaultText
  const hlColor = palette.highlight_color || defaultHl

  return (
    <div className="palette-chip-wrapper">
      <button
        className={`palette-chip${isActive ? ' palette-chip--active' : ''}`}
        onClick={onSelect}
        title={palette.name}
        aria-pressed={isActive}
      >
        <div className="palette-chip__swatch" style={{ background: bg }}>
          <span className="palette-chip__text" style={{ color: textColor }}>Aa</span>
          {palette.highlight_active && (
            <div className="palette-chip__hl" style={{ background: hlColor }} />
          )}
        </div>
        <span className="palette-chip__name">{palette.name}</span>
      </button>
      {showDelete && onDelete && (
        <button
          className="palette-chip__delete"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title={`Delete "${palette.name}"`}
          aria-label={`Delete palette ${palette.name}`}
        >
          ×
        </button>
      )}
    </div>
  )
}

export default function PaletteSelector({
  presets, custom, currentColors, theme, onSelect, onDelete
}: Props) {
  return (
    <div className="palette-selector">
      <div className="palette-group-label">Presets</div>
      <div className="palette-grid">
        {presets.map((p) => (
          <PaletteChip
            key={p.id}
            palette={p}
            isActive={paletteMatchesColors(p, currentColors)}
            theme={theme}
            onSelect={() => onSelect(p)}
          />
        ))}
      </div>

      {custom.length > 0 && (
        <>
          <div className="palette-group-label">Your palettes</div>
          <div className="palette-grid">
            {custom.map((p) => (
              <PaletteChip
                key={p.id}
                palette={p}
                isActive={paletteMatchesColors(p, currentColors)}
                theme={theme}
                showDelete
                onSelect={() => onSelect(p)}
                onDelete={() => onDelete(p.id)}
              />
            ))}
          </div>
        </>
      )}

    </div>
  )
}
