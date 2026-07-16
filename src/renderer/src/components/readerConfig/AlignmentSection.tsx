import React from 'react'
import type { Settings } from '../../types'
import NumericInput from '../NumericInput'

interface Props {
  local: Settings
  update: (patch: Partial<Settings>) => void
}

export default function AlignmentSection({ local, update }: Props) {
  return (
    <section className="settings-section">
      <h2 className="settings-heading">Alignment</h2>

      <div className="settings-row">
        <label htmlFor="rcp-lines-row-gap" className="settings-label">
          Line spacing — vertical
          <span className="settings-hint">Space between rows in multiple-lines mode</span>
        </label>
        <div className="settings-control settings-control-wide">
          <input
            id="rcp-lines-row-gap"
            type="range"
            min={0}
            max={64}
            step={4}
            value={local.lines_row_gap}
            onChange={(e) => update({ lines_row_gap: Number(e.target.value) })}
            className="range-slider"
            disabled={!local.lines_enabled}
          />
          <NumericInput
            value={local.lines_row_gap}
            min={0}
            max={64}
            step={4}
            disabled={!local.lines_enabled}
            onCommit={(lines_row_gap) => update({ lines_row_gap })}
            ariaLabel="Vertical line spacing value"
          />
        </div>
      </div>

      <div className="settings-row">
        <label htmlFor="rcp-stack-gap" className="settings-label">
          Line spacing — horizontal
          <span className="settings-hint">Space between stacks in the same row</span>
        </label>
        <div className="settings-control settings-control-wide">
          <input
            id="rcp-stack-gap"
            type="range"
            min={8}
            max={80}
            step={4}
            value={local.stack_gap}
            onChange={(e) => update({ stack_gap: Number(e.target.value) })}
            className="range-slider"
          />
          <NumericInput
            value={local.stack_gap}
            min={8}
            max={80}
            step={4}
            onCommit={(stack_gap) => update({ stack_gap })}
            ariaLabel="Horizontal line spacing value"
          />
        </div>
      </div>

      <div className="settings-row">
        <label htmlFor="rcp-vertical-offset" className="settings-label">
          Vertical position
          <span className="settings-hint">Shift word stacks up or down on screen</span>
        </label>
        <div className="settings-control settings-control-wide">
          <input
            id="rcp-vertical-offset"
            type="range"
            min={-200}
            max={200}
            step={8}
            value={local.stack_vertical_offset}
            onChange={(e) => update({ stack_vertical_offset: Number(e.target.value) })}
            className="range-slider"
          />
          <NumericInput
            value={local.stack_vertical_offset}
            min={-200}
            max={200}
            step={8}
            onCommit={(stack_vertical_offset) => update({ stack_vertical_offset })}
            ariaLabel="Vertical position value"
          />
        </div>
      </div>

      <div className="settings-row">
        <label htmlFor="rcp-horizontal-offset" className="settings-label">
          Horizontal position
          <span className="settings-hint">Shift word stacks left or right on screen</span>
        </label>
        <div className="settings-control settings-control-wide">
          <input
            id="rcp-horizontal-offset"
            type="range"
            min={-200}
            max={200}
            step={8}
            value={local.stack_horizontal_offset}
            onChange={(e) => update({ stack_horizontal_offset: Number(e.target.value) })}
            className="range-slider"
          />
          <NumericInput
            value={local.stack_horizontal_offset}
            min={-200}
            max={200}
            step={8}
            onCommit={(stack_horizontal_offset) => update({ stack_horizontal_offset })}
            ariaLabel="Horizontal position value"
          />
        </div>
      </div>
    </section>
  )
}
