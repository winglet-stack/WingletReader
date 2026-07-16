import React from 'react'
import type { Settings } from '../../types'
import DisplaySection from './DisplaySection'
import TextSection from './TextSection'
import PlaybackSection from './PlaybackSection'
import AlignmentSection from './AlignmentSection'

type ReaderConfigEditorSection = 'display' | 'text' | 'playback' | 'alignment'

const SECTIONS: Array<{ id: ReaderConfigEditorSection; label: string }> = [
  { id: 'display', label: 'Display' },
  { id: 'text', label: 'Text' },
  { id: 'playback', label: 'Playback' },
  { id: 'alignment', label: 'Alignment' },
]

interface ReaderConfigEditorCoreProps {
  value: Settings
  onChange: (patch: Partial<Settings>) => void
  activeSection?: ReaderConfigEditorSection
  onSectionChange?: (section: ReaderConfigEditorSection) => void
  className?: string
  ariaLabel?: string
}

function renderSection(
  section: ReaderConfigEditorSection,
  value: Settings,
  onChange: (patch: Partial<Settings>) => void
) {
  switch (section) {
    case 'display':
      return <DisplaySection local={value} update={onChange} />
    case 'text':
      return <TextSection local={value} update={onChange} />
    case 'playback':
      return <PlaybackSection local={value} update={onChange} />
    case 'alignment':
      return <AlignmentSection local={value} update={onChange} />
  }
}

export default function ReaderConfigEditorCore({
  value,
  onChange,
  activeSection,
  onSectionChange,
  className = 'rcp-controls',
  ariaLabel = 'Reader configuration',
}: ReaderConfigEditorCoreProps) {
  const visibleSections = activeSection ? [activeSection] : SECTIONS.map((section) => section.id)

  return (
    <div className={className} aria-label={ariaLabel}>
      {activeSection && onSectionChange && (
        <div className="rcp-section-tabs" role="tablist" aria-label="Reader config sections">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={activeSection === section.id}
              className={`theme-pill${activeSection === section.id ? ' theme-pill-active' : ''}`}
              onClick={() => onSectionChange(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>
      )}

      {visibleSections.map((section) => (
        <React.Fragment key={section}>
          {renderSection(section, value, onChange)}
        </React.Fragment>
      ))}
    </div>
  )
}
