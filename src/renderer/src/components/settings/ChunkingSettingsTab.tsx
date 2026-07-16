import React from 'react'
import type { Settings } from '../../types'
import SettingToggleRow from '../SettingToggleRow'

const CHUNK_RULES = [
  ['chunk_rule_long_word', 'Long word', 'Break before words longer than 15 characters'],
  ['chunk_rule_enumerations', 'Enumerations', 'Break at numbered and lettered list markers'],
  ['chunk_rule_bullets', 'Bullets', 'Break at bullet and dash list markers'],
  ['chunk_rule_commas', 'Commas', 'Break after words ending with a comma'],
  ['chunk_rule_names', 'Names', 'Keep multi-word proper names together'],
  ['chunk_rule_headlines', 'Headlines', 'Group headline paragraphs into single stacks']
] as const

interface Props {
  local: Settings
  update: (patch: Partial<Settings>) => void
}

export default function ChunkingSettingsTab({ local, update }: Props) {
  return (
    <section className="settings-section">
      <h2 className="settings-heading">Chunking Rules</h2>
      <p className="settings-hint" style={{ marginBottom: '1rem' }}>
        Control how text is split into word stacks during reading.
      </p>

      {CHUNK_RULES.map(([field, label, hint]) => (
        <SettingToggleRow
          key={field}
          label={label}
          hint={hint}
          checked={local[field]}
          onChange={(checked) => update({ [field]: checked })}
        />
      ))}
    </section>
  )
}
