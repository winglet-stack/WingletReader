import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddChapterPanel from '../components/AddChapterPanel'
import type { TextRecord } from '../types'

afterEach(() => {
  cleanup()
  delete (window as unknown as { api?: unknown }).api
})

const targetBook: TextRecord = {
  id: 1,
  title: 'Book',
  content: '',
  word_count: 0,
  is_manual_book: true,
}

describe('AddChapterPanel', () => {
  it('shows content copy, an editable file preview, and saves edited content text', async () => {
    const user = userEvent.setup()
    const appendSegment = vi.fn().mockResolvedValue({
      id: 10,
      textId: 1,
      title: 'Imported Chapter',
      content: 'Edited chapter text with enough words',
      order: 0,
      sourceType: 'detected_heading',
      word_count: 6,
    })
    ;(window as unknown as { api: unknown }).api = {
      file: {
        open: vi.fn().mockResolvedValue({
          fileName: 'chapter.docx',
          title: 'Imported Chapter',
          content: 'Original chapter text with enough words',
          warnings: [],
          ext: 'docx',
          pageCount: 1,
          diagnostics: {
            parser: 'mammoth',
            sourceExtension: 'docx',
            fileSizeBytes: 123,
            charCount: 40,
            wordCount: 6,
            paragraphCount: 1,
            pageCount: 1,
            cleanupActions: [],
            suspiciousSignals: [],
          },
        }),
      },
      db: {
        appendSegment,
        saveSummary: vi.fn().mockResolvedValue({}),
      },
    }

    render(
      <AddChapterPanel
        targetBook={targetBook}
        chapterCount={0}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { name: 'Add Content' })).toBeTruthy()
    expect(screen.getByLabelText('Content title')).toBeTruthy()
    expect(screen.getByText('Content text')).toBeTruthy()
    expect(screen.getByPlaceholderText('Paste or type the content text here…')).toBeTruthy()
    expect(screen.getByLabelText(/Summary/).getAttribute('placeholder')).toBe('A brief summary of this chapter…')

    await user.click(screen.getByRole('tab', { name: 'Upload File' }))
    await user.click(screen.getByRole('button', { name: 'Drop file here or click to browse' }))

    const preview = await screen.findByLabelText('Review extracted text')
    await user.clear(preview)
    await user.type(preview, 'Edited chapter text with enough words')
    await user.click(screen.getByRole('button', { name: 'Save Content' }))

    expect(appendSegment).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        title: 'Imported Chapter',
        content: 'Edited chapter text with enough words',
        word_count: 6,
      })
    )
  })

  it('uses content wording for validation errors', async () => {
    const user = userEvent.setup()
    ;(window as unknown as { api: unknown }).api = {
      db: {
        appendSegment: vi.fn(),
        saveSummary: vi.fn(),
      },
    }

    render(
      <AddChapterPanel
        targetBook={targetBook}
        chapterCount={0}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    await user.type(screen.getByLabelText('Content title'), 'Short content')
    await user.type(screen.getByPlaceholderText('Paste or type the content text here…'), 'too short')
    await user.click(screen.getByRole('button', { name: 'Save Content' }))

    expect(screen.getByRole('alert').textContent).toContain('Content text is too short')
  })
})
