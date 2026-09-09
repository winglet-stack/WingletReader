/**
 * Reader settings layout descriptor (ADR-0019 / SRQ-6).
 *
 * The descriptor sits on top of `settingMetadata.ts`: it references fields by
 * name and declares where each one renders, but never re-derives a field's
 * instrument, range, or reveal behavior.
 */

/** An ordered list of setting fields under a section heading. */
export interface ReaderSettingsSection {
  id: string
  label: string
  /** Metadata field names, in render order. */
  fields: readonly string[]
}

/** One visual column in a settings tab. Columns may stack multiple sections. */
export interface ReaderSettingsColumn {
  id: string
  sections: readonly ReaderSettingsSection[]
  /** Settings host: mount the folded live preview below this column's sections. */
  previewBelow?: boolean
}

/** One screen, two columns. */
export interface ReaderSettingsColumnsTab {
  id: 'playback-grid' | 'display' | 'custom-colors'
  label: string
  kind: 'columns'
  columns: readonly ReaderSettingsColumn[]
}

export type ReaderSettingsTab = ReaderSettingsColumnsTab

export const READER_SETTINGS_LAYOUT: readonly ReaderSettingsTab[] = [
  {
    id: 'playback-grid',
    label: 'Playback & Grid Layout',
    kind: 'columns',
    columns: [
      {
        id: 'playback',
        sections: [
          {
            id: 'playback',
            label: 'Playback',
            fields: [
              'tap_to_read',
              'tap_to_read_key',
              'live_rewind_stacks',
              'live_rewind_key',
              'bpm', // Speed, with a derived WPM readout
              'metronome_enabled',
              'pause_at_sentences',
              'pause_at_headlines',
            ],
          },
        ],
      },
      {
        id: 'grid',
        previewBelow: true,
        sections: [
          {
            id: 'grid',
            label: 'Grid Layout',
            fields: [
              'words_per_stack',
              'stacks_visible',
              'lines_count',
              'lines_anchor',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'display',
    label: 'Display',
    kind: 'columns',
    columns: [
      {
        id: 'display-text-spacing',
        sections: [
          {
            id: 'text-highlighting',
            label: 'Text & Highlighting',
            fields: [
              'font_size',
              'font_family',
              'highlight_active',
              'highlight_mode',
              'highlight_panning_chunk_size',
            ],
          },
          {
            id: 'spacing',
            label: 'Spacing',
            fields: [
              'lines_row_gap',
              'stack_gap',
              'stack_vertical_offset',
              'stack_horizontal_offset',
            ],
          },
        ],
      },
      {
        id: 'colors',
        previewBelow: true,
        sections: [
          {
            id: 'colors',
            label: 'Colors',
            fields: [
              'palette',
              'text_color',
              'viewport_bg_color',
              'highlight_color',
              'highlight_text_color',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'custom-colors',
    label: 'Custom colors',
    kind: 'columns',
    columns: [
      {
        id: 'custom-colors',
        sections: [
          {
            id: 'custom-colors',
            label: 'Colors',
            fields: [
              'text_color',
              'viewport_bg_color',
              'highlight_color',
              'highlight_text_color',
            ],
          },
        ],
      },
      {
        id: 'custom-colors-preview',
        previewBelow: true,
        sections: [],
      },
    ],
  },
]

/** Flat list of every field the descriptor places: handy for tests and guards. */
export const READER_SETTINGS_LAYOUT_FIELDS: readonly string[] = READER_SETTINGS_LAYOUT.flatMap(
  (tab) => tab.columns.flatMap((col) => col.sections.flatMap((section) => section.fields))
)
