import type { Settings } from '../../types'

export type RwwSettingsField = keyof Settings

/**
 * A titled group of fields inside a section card. Sections that carry
 * subsections render one card with an h2 section heading and an h3 sub-heading
 * per group (e.g. Layout → Grid Layout + Text), so related field groups share a
 * card instead of splitting across columns.
 */
export interface RwwSettingsSubSection {
  id: string
  label: string
  fields: readonly RwwSettingsField[]
}

export interface RwwSettingsSection {
  id: string
  label: string
  /** Flat field list for a plain card. Empty when the card uses `subsections`. */
  fields: readonly RwwSettingsField[]
  /**
   * Sub-headed field groups rendered inside one card. When present, `fields`
   * stays empty and each subsection contributes its own h3 + rows.
   */
  subsections?: readonly RwwSettingsSubSection[]
  /**
   * Overlay-stack fold-down block (ADR-0021): renders collapsed by default with a
   * compact summary and expands inline. The stack enforces single-open discipline
   * across all fold-down sections to guard the minimum-window no-scroll threshold.
   */
  foldDown?: boolean
}

export interface RwwSettingsColumn {
  id: string
  sections: readonly RwwSettingsSection[]
  /**
   * Preview-only column (slice 05): mount the live preview as this column's sole
   * content when the preview is open. Parallels `ReaderSettingsColumn.previewBelow`
   * but hosts the preview in a dedicated second column rather than folding it
   * below a section. The column carries no sections and renders nothing when the
   * preview is closed.
   */
  previewHost?: boolean
}

export interface RwwSettingsTab {
  id: 'playback-grid' | 'overlay'
  label: string
  columns: readonly RwwSettingsColumn[]
}

export const RWW_SETTINGS_LAYOUT: readonly RwwSettingsTab[] = [
  {
    id: 'overlay',
    label: 'Overlay',
    // Bespoke three-block management stack (ADR-0021): Standby pill → Shortcut
    // settings → Window size. Sections drive block order/titles; each section id
    // maps to a dedicated Overlay block renderer, not the generic field list.
    columns: [
      {
        id: 'overlay-stack',
        sections: [
          {
            id: 'standby',
            label: 'Standby pill',
            fields: ['read_while_working_show_standby_control'],
          },
          {
            id: 'shortcuts',
            label: 'Shortcut settings',
            fields: [
              'read_while_working_shortcut',
              'read_while_working_exit_shortcut',
            ],
          },
          {
            id: 'window-size',
            label: 'Window size',
            foldDown: true,
            fields: [
              'read_while_working_window_width',
              'read_while_working_window_height',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'playback-grid',
    label: 'Reader configuration',
    columns: [
      {
        // Left column stacks Playback then the combined Layout card (slice 03):
        // grid and font size share one card under Grid Layout / Text sub-headings.
        // The live preview no longer folds below this card — slice 05 relocates it
        // to the dedicated preview column beside it.
        id: 'playback',
        sections: [
          {
            id: 'playback',
            label: 'Playback',
            fields: ['bpm', 'live_rewind_stacks', 'live_rewind_key'],
          },
          {
            id: 'layout',
            label: 'Layout',
            fields: [],
            subsections: [
              {
                id: 'grid',
                label: 'Grid Layout',
                fields: [
                  'words_per_stack',
                  'stacks_visible',
                  'lines_count',
                ],
              },
              {
                id: 'text',
                label: 'Text',
                fields: ['font_size'],
              },
            ],
          },
        ],
      },
      {
        // Preview-only second column (slice 05): renders the live preview when
        // opened, and nothing (skipped entirely) when closed so the editor
        // collapses to the single Playback column.
        id: 'preview',
        previewHost: true,
        sections: [],
      },
    ],
  },
]

function sectionFields(
  section: RwwSettingsSection
): readonly RwwSettingsField[] {
  if (section.subsections) {
    return section.subsections.flatMap((sub) => sub.fields)
  }
  return section.fields
}

export const RWW_SETTINGS_LAYOUT_FIELDS: readonly RwwSettingsField[] =
  RWW_SETTINGS_LAYOUT.flatMap((tab) =>
    tab.columns.flatMap((column) =>
      column.sections.flatMap((section) => sectionFields(section))
    )
  )
