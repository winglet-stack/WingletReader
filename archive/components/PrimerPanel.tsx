import React, { useMemo } from 'react'
import { generatePrimer } from '../engine/textPrimer'
import type { PrimerSection } from '../engine/textPrimer'
import type { TextRecord } from '@renderer/types'

interface Props {
  text: TextRecord
  onBack: () => void
  onRead: () => void
  onTrailer: () => void
}

export default function PrimerPanel({ text, onBack, onRead, onTrailer }: Props) {
  const primer = useMemo(() => generatePrimer(text.content ?? ''), [text.content])

  return (
    <div className="view-container">
      <header className="view-header">
        <h1>Text Primer</h1>
        <div className="primer-header-actions">
          <button className="btn-ghost" onClick={onBack}>
            &#8592; Library
          </button>
          <button className="btn-ghost" onClick={onTrailer} title="Read this primer as a speed-reading trailer">
            &#9654; Trailer Mode
          </button>
          <button className="btn-primary" onClick={onRead}>
            &#9654; Start Reading
          </button>
        </div>
      </header>

      <p className="primer-subtitle">{text.title}</p>

      <div className="primer-sections">
        {primer.sections.map((section) => (
          <SectionCard key={section.id} section={section} />
        ))}
      </div>
    </div>
  )
}

function SectionCard({ section }: { section: PrimerSection }) {
  const isEmpty = section.items.length === 0

  return (
    <div className={`primer-card${isEmpty ? ' primer-card-empty' : ''}`}>
      <div className="primer-card-header">
        <h2 className="primer-card-title">{section.label}</h2>
        <span className={`primer-badge ${section.generated ? 'primer-badge-generated' : 'primer-badge-extracted'}`}>
          {section.generated ? 'Generated' : 'Extracted'}
        </span>
      </div>

      {section.generated && section.generatedNote && (
        <p className="primer-generated-note">{section.generatedNote}</p>
      )}

      {isEmpty ? (
        <p className="primer-empty-msg">{section.fallback}</p>
      ) : (
        <SectionBody section={section} />
      )}
    </div>
  )
}

function SectionBody({ section }: { section: PrimerSection }) {
  if (section.displayAs === 'prose') {
    return (
      <div className="primer-prose">
        {section.items.map((item, i) => (
          <p key={i} className="primer-prose-para">{item.text}</p>
        ))}
      </div>
    )
  }

  if (section.displayAs === 'chips') {
    return (
      <div className="primer-chips">
        {section.items.map((item, i) => (
          <span key={i} className="primer-chip">{item.text}</span>
        ))}
      </div>
    )
  }

  // Default: 'list'
  const isNumbered = section.id === 'questions'
  const ListTag = isNumbered ? 'ol' : 'ul'
  return (
    <ListTag className={`primer-list${isNumbered ? ' primer-list-numbered' : ''}`}>
      {section.items.map((item, i) => (
        <li key={i} className="primer-list-item">{item.text}</li>
      ))}
    </ListTag>
  )
}
