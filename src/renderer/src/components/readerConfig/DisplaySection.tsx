import React from 'react'
import type { Settings } from '../../types'
import SettingToggleRow from '../SettingToggleRow'
import ColorSettingRow from './ColorSettingRow'

interface Props {
  local: Settings
  update: (patch: Partial<Settings>) => void
}

export default function DisplaySection({ local, update }: Props) {
  return (
    <section className="settings-section">
      <h2 className="settings-heading">Display</h2>

      <SettingToggleRow
        label="Show chunk dividers"
        hint="Vertical lines between word stacks"
        checked={local.show_chunk_dividers}
        onChange={(checked) => update({ show_chunk_dividers: checked })}
      />

      <ColorSettingRow
        label="Viewport background"
        hint="Reader stage background color"
        theme={local.theme}
        value={local.viewport_bg_color}
        lightDefault="#fafafa"
        darkDefault="#0d0d0d"
        onChange={(viewport_bg_color) => update({ viewport_bg_color })}
      />
    </section>
  )
}
