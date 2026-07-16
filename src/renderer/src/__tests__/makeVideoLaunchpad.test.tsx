/**
 * Make Video launchpad (slice 03).
 *
 * Acceptance criteria covered:
 *   - "Choose from library" calls openTransmuteForText with the correct text id.
 *   - "Paste / upload" mode shows ImportPanel; onCreateVideoWithoutSaving calls openTransmuteForUnsavedSource.
 *   - Empty-library state renders the "Import a text" CTA instead of the text list.
 *
 * Environment: happy-dom (vitest.config.ts environmentMatchGlobs).
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MakeVideoLaunchpad from '../components/hub/MakeVideoLaunchpad'
import { NavigationContext, type NavigationContextValue } from '../contexts/NavigationContext'
import { LibraryContext } from '../contexts/LibraryContext'
import type { TextRecord } from '../types'

// ── Minimal context stubs ────────────────────────────────────────────────────

function makeNavCtx(overrides: Partial<NavigationContextValue> = {}): NavigationContextValue {
  return {
    view: 'make-video',
    setView: vi.fn(),
    settingsMode: 'global',
    settingsSubview: null,
    settingsSubviewOrigin: 'settings',
    setSettingsSubview: vi.fn(),
    openGlobalSettings: vi.fn(),
    openOverlayReaderSettings: vi.fn(),
    openTransmuteReaderSettings: vi.fn(),
    openTransmuteForText: vi.fn(),
    transmuteLaunchTextId: null,
    clearTransmuteLaunch: vi.fn(),
    openTransmuteForUnsavedSource: vi.fn(),
    transmuteLaunchSource: null,
    clearTransmuteLaunchSource: vi.fn(),
    ...overrides,
  }
}

function makeText(id: number, title: string): TextRecord {
  return {
    id,
    title,
    content: 'placeholder content for test',
    word_count: 4,
    created_at: '',
    updated_at: '',
  }
}

interface RenderOptions {
  texts?: TextRecord[]
  navOverrides?: Partial<NavigationContextValue>
}

function renderLaunchpad({ texts = [], navOverrides = {} }: RenderOptions = {}) {
  const nav = makeNavCtx(navOverrides)
  const libraryCtx = {
    texts,
    categories: [],
    activeText: null,
    segments: [],
    parentText: null,
    libraryTab: 'list' as const,
    setLibraryTab: vi.fn(),
    addChapterTarget: null,
    setAddChapterTarget: vi.fn(),
    handleImportSave: vi.fn(),
    handleDelete: vi.fn(),
    openSegments: vi.fn(),
    handleOpenAddChapter: vi.fn(),
    handleAddChapterSaved: vi.fn(),
    refreshTexts: vi.fn(),
    createCategory: vi.fn(),
    renameCategory: vi.fn(),
    deleteCategory: vi.fn(),
    assignTextCategory: vi.fn(),
    error: null,
    clearError: vi.fn(),
  }
  render(
    <NavigationContext.Provider value={nav}>
      <LibraryContext.Provider value={libraryCtx as any}>
        <MakeVideoLaunchpad />
      </LibraryContext.Provider>
    </NavigationContext.Provider>
  )
  return { nav }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MakeVideoLaunchpad — choose from library', () => {
  afterEach(cleanup)

  it('renders a "Make Video" button for each text in the library', () => {
    renderLaunchpad({ texts: [makeText(1, 'Book A'), makeText(2, 'Book B')] })
    expect(screen.getAllByRole('button', { name: /make video/i })).toHaveLength(2)
  })

  it('calls openTransmuteForText with the correct id when "Make Video" is clicked', async () => {
    const user = userEvent.setup()
    const openTransmuteForText = vi.fn()
    renderLaunchpad({
      texts: [makeText(42, 'My Story')],
      navOverrides: { openTransmuteForText },
    })
    await user.click(screen.getByRole('button', { name: /make video/i }))
    expect(openTransmuteForText).toHaveBeenCalledOnce()
    expect(openTransmuteForText).toHaveBeenCalledWith(42)
  })

  it('shows the empty-library CTA when there are no texts', () => {
    renderLaunchpad({ texts: [] })
    expect(screen.queryAllByRole('button', { name: /make video/i })).toHaveLength(0)
    expect(screen.getByRole('button', { name: /import a text/i })).toBeTruthy()
  })

  it('calls setView("import") when the empty-library CTA is clicked', async () => {
    const user = userEvent.setup()
    const setView = vi.fn()
    renderLaunchpad({ texts: [], navOverrides: { setView } })
    await user.click(screen.getByRole('button', { name: /import a text/i }))
    expect(setView).toHaveBeenCalledWith('import')
  })
})

describe('MakeVideoLaunchpad — paste / upload route', () => {
  afterEach(cleanup)

  it('switches to ImportPanel when the paste button is clicked', async () => {
    const user = userEvent.setup()
    renderLaunchpad()
    const pasteBtn = screen.getByRole('button', { name: /paste or upload/i })
    await user.click(pasteBtn)
    // ImportPanel's paste textarea is present
    expect(screen.getByLabelText('Paste your text below')).toBeTruthy()
  })

  it('calls openTransmuteForUnsavedSource when ImportPanel fires onCreateVideoWithoutSaving', async () => {
    const user = userEvent.setup()
    const openTransmuteForUnsavedSource = vi.fn()
    renderLaunchpad({ navOverrides: { openTransmuteForUnsavedSource } })

    // Enter paste mode
    await user.click(screen.getByRole('button', { name: /paste or upload/i }))

    // Fill in title + body in ImportPanel
    await user.type(screen.getByLabelText('Title'), 'My Test Video')
    await user.type(screen.getByLabelText('Paste your text below'), 'Alpha beta gamma delta epsilon')

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /create video without saving/i }))
    })

    expect(openTransmuteForUnsavedSource).toHaveBeenCalledOnce()
    expect(openTransmuteForUnsavedSource).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My Test Video' })
    )
  })

  it('returns to pick mode when ImportPanel cancel is triggered', async () => {
    const user = userEvent.setup()
    renderLaunchpad()

    // Enter paste mode
    await user.click(screen.getByRole('button', { name: /paste or upload/i }))
    expect(screen.getByLabelText('Paste your text below')).toBeTruthy()

    // Cancel
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    // Back in pick mode — the paste button is visible again
    expect(screen.getByRole('button', { name: /paste or upload/i })).toBeTruthy()
  })
})
