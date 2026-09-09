/**
 * The Import surface's presentational parts (codebase-health 08).
 *
 * Markup, copy, and the small conditionals that decide whether a row appears at
 * all. Nothing here holds state — the parts are what the plain form composes and
 * what the takeover renders around a channel's card.
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportSurfaceHeader, ImportError } from '../components/ImportPanelParts'
import {
  ImportTitleField,
  ImportCategoryField,
  ImportTabRow,
  ImportPasteArea,
  ImportFilePreview,
  ImportFormActions
} from '../components/import/ImportFormFields'
import ImportTextProcessingSection from '../components/import/ImportTextProcessingSection'
import ImportBookTakeover from '../components/import/ImportBookTakeover'
import type { CategoryRecord } from '../types'
import type { ImportBookChannel } from '../components/import/bookChannels'

afterEach(cleanup)

const CATEGORIES: CategoryRecord[] = [
  { id: 1, name: 'Uncategorized', is_system: true, is_locked: true },
  { id: 2, name: 'Fiction' }
]

describe('ImportSurfaceHeader', () => {
  it('cancels out of Import', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<ImportSurfaceHeader onCancel={onCancel} />)

    expect(screen.getByRole('heading', { name: 'Import Text' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalled()
  })
})

describe('ImportError', () => {
  it('renders nothing without an error', () => {
    const { container } = render(<ImportError error={null} />)

    expect(container.innerHTML).toBe('')
  })

  it('announces the error', () => {
    render(<ImportError error="Please enter a title." />)

    expect(screen.getByRole('alert').textContent).toBe('Please enter a title.')
  })
})

describe('ImportTitleField', () => {
  it('reports typing and keeps it away from the global shortcuts', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const windowKeydown = vi.fn()
    window.addEventListener('keydown', windowKeydown)

    try {
      render(<ImportTitleField title="" onChange={onChange} />)
      await user.type(screen.getByLabelText('Title'), 'A')

      expect(onChange).toHaveBeenCalledWith('A')
      expect(windowKeydown).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', windowKeydown)
    }
  })
})

describe('ImportCategoryField', () => {
  it('renders nothing before the Library has categories', () => {
    const { container } = render(
      <ImportCategoryField categories={[]} selectedCategoryId={undefined} onChange={vi.fn()} />
    )

    expect(container.innerHTML).toBe('')
  })

  it('offers every category and reports the pick as a number', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ImportCategoryField categories={CATEGORIES} selectedCategoryId={1} onChange={onChange} />
    )

    await user.selectOptions(screen.getByLabelText('Category'), '2')

    expect(screen.getByRole('option', { name: 'Fiction' })).toBeTruthy()
    expect(onChange).toHaveBeenCalledWith(2)
  })
})

describe('ImportTabRow', () => {
  it('marks the active tab and reports a switch', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<ImportTabRow tab="paste" onSelect={onSelect} />)

    const paste = screen.getByRole('tab', { name: 'Paste Text' })
    expect(paste.getAttribute('aria-selected')).toBe('true')
    expect(paste.className).toBe('tab-btn tab-active')
    expect(screen.getByRole('tab', { name: 'Upload File' }).className).toBe('tab-btn')

    await user.click(screen.getByRole('tab', { name: 'Upload File' }))
    expect(onSelect).toHaveBeenCalledWith('file')
  })
})

describe('ImportPasteArea', () => {
  it('reports typed text without waking the global shortcuts', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const windowKeydown = vi.fn()
    window.addEventListener('keydown', windowKeydown)

    try {
      render(<ImportPasteArea pastedText="" onChange={onChange} />)
      await user.type(screen.getByLabelText('Paste your text below'), 'x')

      expect(onChange).toHaveBeenCalledWith('x')
      expect(windowKeydown).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', windowKeydown)
    }
  })
})

describe('ImportFilePreview', () => {
  it('stays absent until a file is loaded', () => {
    const { container } = render(<ImportFilePreview fileContent={null} onChange={vi.fn()} />)

    expect(container.innerHTML).toBe('')
  })

  it('shows the extracted text for review, and it is editable', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ImportFilePreview fileContent="Extracted" onChange={onChange} />)

    const preview = screen.getByLabelText('Review extracted text') as HTMLTextAreaElement
    expect(preview.value).toBe('Extracted')
    await user.type(preview, '!')

    expect(onChange).toHaveBeenCalledWith('Extracted!')
  })
})

describe('ImportFormActions', () => {
  it('offers only Save when no host takes an unsaved video', () => {
    render(<ImportFormActions busy={false} onSubmit={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Save & Open in Reader' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /create video without saving/i })).toBeNull()
  })

  it('offers the unsaved-video door when a host supplies one', async () => {
    const user = userEvent.setup()
    const onCreateVideoWithoutSaving = vi.fn()
    render(
      <ImportFormActions
        busy={false}
        onSubmit={vi.fn()}
        onCreateVideoWithoutSaving={onCreateVideoWithoutSaving}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Create Video Without Saving' }))

    expect(onCreateVideoWithoutSaving).toHaveBeenCalled()
  })

  it('disables both actions while a file is opening', () => {
    render(
      <ImportFormActions busy onSubmit={vi.fn()} onCreateVideoWithoutSaving={vi.fn()} />
    )

    for (const button of screen.getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })
})

describe('ImportTextProcessingSection', () => {
  it('renders nothing under the alpha chrome flag', () => {
    // `alphaChrome.importTextProcessingEnabled` is false for alpha v1; the
    // enabled branch has its own suite.
    const { container } = render(
      <ImportTextProcessingSection
        segEnabled
        onSegEnabledChange={vi.fn()}
        chapterDetect
        onChapterDetectChange={vi.fn()}
      />
    )

    expect(container.innerHTML).toBe('')
  })
})

describe('ImportBookTakeover', () => {
  const channel = {
    id: 'invented',
    label: 'Invented Book',
    pickOption: 'onWingletBook',
    parse: vi.fn(),
    commit: vi.fn(),
    describe: (verdict: { status: string }) => ({
      kind: 'confirm' as const,
      title: verdict.status,
      meta: ['1 chapter'],
      detail: 'invented'
    })
  } as unknown as ImportBookChannel

  it('renders whatever the open channel describes, above the error line', () => {
    render(
      <ImportBookTakeover
        takeover={{
          channel,
          verdict: { status: 'a card' },
          busy: true,
          onAdd: vi.fn(),
          onDismiss: vi.fn()
        }}
        error="Failed to add book: disk gone"
      />
    )

    expect(screen.getByText('Invented Book')).toBeTruthy()
    expect(screen.getByText('a card')).toBeTruthy()
    // The commit lock reaches the card it drew, not just the channel.
    expect(screen.getByRole('button', { name: 'Adding…' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('Failed to add book: disk gone')
  })
})
