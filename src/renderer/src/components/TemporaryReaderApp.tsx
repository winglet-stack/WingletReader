import React, { useCallback, useEffect, useRef, useState } from 'react'
import Reader from './Reader'
import type { Settings, TemporaryReaderSession, TextRecord } from '../types'
import { NavigationProvider } from '../contexts/NavigationContext'
import { SettingsProvider } from '../contexts/SettingsContext'
import { LibraryProvider } from '../contexts/LibraryContext'
import { ReaderProvider } from '../contexts/ReaderContext'

const fallbackMessage = 'No temporary reading session was found.'

export default function TemporaryReaderApp() {
  const [session, setSession] = useState<TemporaryReaderSession | null>(null)
  const [sessionSettings, setSessionSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const finishingRef = useRef(false)

  useEffect(() => {
    window.api.readWhileWorking.getTemporarySession()
      .then((result) => {
        setSession(result.session)
        setSessionSettings(result.settings)
        if (!result.session) setError(fallbackMessage)
      })
      .catch((err: Error) => setError(`Failed to load selected text: ${err.message}`))
      .finally(() => setLoading(false))
  }, [])

  // The overlay session ends the same way whether playback completed or the
  // reader was closed, and main never read the old `reason` argument, so the
  // channel takes none. The guard — finish at most once per mount, so a
  // StrictMode effect replay cannot close a live session — is the part that
  // ever mattered here.
  const finish = useCallback(() => {
    if (finishingRef.current) return
    finishingRef.current = true
    window.api.readWhileWorking.finishTemporarySession().catch(() => {})
  }, [])

  if (loading) {
    return <div className="app-loading"><span>Loading selected text...</span></div>
  }

  if (error || !session || !sessionSettings) {
    return (
      <div className="temporary-reader-empty" role="alert">
        <p>{error ?? fallbackMessage}</p>
      </div>
    )
  }

  const sessionText: TextRecord = {
    title: session.title,
    content: session.content,
    word_count: session.content.trim().split(/\s+/).filter(Boolean).length
  }

  return (
    <NavigationProvider>
      <SettingsProvider initialSettings={sessionSettings}>
        <LibraryProvider initialActiveText={sessionText}>
          <ReaderProvider
            onReadingComplete={finish}
            initialResumeFrom={0}
          >
            <Reader
              onBack={finish}
              onExitToLibrary={finish}
              backLabel="Close"
              completion="host-completion"
              libraryBrowseEnabled={false}
            />
          </ReaderProvider>
        </LibraryProvider>
      </SettingsProvider>
    </NavigationProvider>
  )
}
