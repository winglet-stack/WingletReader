import React, { useState } from 'react'
import { useNavigation } from '../../contexts/NavigationContext'
import { useLibrary } from '../../contexts/LibraryContext'
import ImportPanel from '../ImportPanel'
import type { TextRecord } from '../../types'

type Mode = 'pick' | 'paste'

export default function MakeVideoLaunchpad() {
  const { setView, openTransmuteForText, openTransmuteForUnsavedSource } = useNavigation()
  const { texts } = useLibrary()
  const [mode, setMode] = useState<Mode>('pick')

  if (mode === 'paste') {
    return (
      <ImportPanel
        onCancel={() => setMode('pick')}
        onCreateVideoWithoutSaving={(title, content) =>
          openTransmuteForUnsavedSource({ title, content })
        }
      />
    )
  }

  return (
    <div className="mv-launchpad">
      <div className="mv-launchpad-inner">
        <header className="mv-launchpad-header">
          <button
            type="button"
            className="btn-ghost btn-small mv-back-btn"
            onClick={() => setView('hub')}
          >
            ← Hub
          </button>
          <h1 className="mv-launchpad-title">Make Video</h1>
        </header>

        <section className="mv-primary" aria-labelledby="mv-library-heading">
          <h2 className="mv-section-heading" id="mv-library-heading">
            Choose from library
          </h2>
          {texts.length === 0 ? (
            <div className="mv-empty-library">
              <p className="mv-empty-msg">No texts in your library yet.</p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setView('import')}
              >
                Import a text
              </button>
            </div>
          ) : (
            <ul className="mv-text-list" role="list">
              {texts.map((text: TextRecord) => (
                <li key={text.id} className="mv-text-row">
                  <span className="mv-text-title">{text.title}</span>
                  <button
                    type="button"
                    className="btn-primary btn-small mv-make-btn"
                    onClick={() => openTransmuteForText(text.id!)}
                  >
                    ▶ Make Video
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mv-secondary" aria-labelledby="mv-paste-heading">
          <h2 className="mv-section-heading mv-section-heading--secondary" id="mv-paste-heading">
            Or paste / upload new text
          </h2>
          <p className="mv-secondary-hint">
            Render a video without saving to your library.
          </p>
          <button
            type="button"
            className="btn-ghost mv-paste-btn"
            onClick={() => setMode('paste')}
          >
            Paste or upload text →
          </button>
        </section>
      </div>
    </div>
  )
}
