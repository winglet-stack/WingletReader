import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import AppShell from '../AppShell'
import { LibraryProvider } from '../contexts/LibraryContext'
import { NavigationProvider, useNavigation } from '../contexts/NavigationContext'
import { ReaderProvider } from '../contexts/ReaderContext'
import { SettingsProvider } from '../contexts/SettingsContext'
import type { TextRecord } from '../types'

vi.mock('../components/Reader', () => ({
  default: ({
    onBack,
    onExitToLibrary,
    backLabel,
  }: {
    onBack: () => void
    onExitToLibrary: () => void
    backLabel?: string
  }) => (
    <div role="region" aria-label="Mock Reader">
      <button type="button" onClick={onBack}>{backLabel ?? 'Back'}</button>
      <button type="button" onClick={onExitToLibrary}>Mock exit to library</button>
    </div>
  ),
}))

const ACTIVE_TEXT: TextRecord = {
  id: 42,
  title: 'Routing Fixture',
  content: 'one two three four',
  word_count: 4,
}

beforeEach(() => {
  vi.stubGlobal('api', {
    app: {
      getVersion: vi.fn().mockResolvedValue('0.1.0-alpha.test'),
      splashReady: vi.fn(),
    },
    db: {
      getTexts: vi.fn().mockResolvedValue([ACTIVE_TEXT]),
      getText: vi.fn().mockResolvedValue(ACTIVE_TEXT),
      getSegments: vi.fn().mockResolvedValue([]),
      getLatestResumeCandidate: vi.fn().mockResolvedValue(null),
      saveSettings: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
      saveSettingsStore: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
    },
    readWhileWorking: {
      onEnableFailed: vi.fn(() => () => {}),
      getStatus: vi.fn().mockResolvedValue({
        enabled: false,
        supported: true,
        registered: false,
        shortcut: 'Control+Space',
        exitShortcut: 'Control+Space',
        exitRegistered: false,
        error: null,
        exitError: null,
      }),
    },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function ForceReaderView() {
  const { setView } = useNavigation()
  React.useEffect(() => {
    setView('reader')
  }, [setView])
  return null
}

async function mountShellInReader() {
  await act(async () => {
    render(
      <NavigationProvider>
        <SettingsProvider initialSettings={DEFAULT_SETTINGS}>
          <LibraryProvider initialActiveText={ACTIVE_TEXT}>
            <ReaderProvider>
              <ForceReaderView />
              <AppShell />
            </ReaderProvider>
          </LibraryProvider>
        </SettingsProvider>
      </NavigationProvider>
    )
  })
  await screen.findByRole('region', { name: 'Mock Reader' })
}

describe('AppShell Reader routing', () => {
  it('threads Reader onExitToLibrary to the standard Library view', async () => {
    await mountShellInReader()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mock exit to library' }))
    })

    expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Mock Reader' })).toBeNull()
  })
})
