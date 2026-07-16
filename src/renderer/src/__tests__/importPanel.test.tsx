import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImportPanel, { type ImportProcessingSettings } from '../components/ImportPanel'

afterEach(() => {
  cleanup()
  delete (window as unknown as { api?: unknown }).api
})

const settings: ImportProcessingSettings = {
  segmentation_enabled: true,
  auto_chapter_detection: true,
  segmentation_threshold: 5000,
  segmentation_chunk_size: 1500,
}

describe('ImportPanel', () => {
  it('accepts keyboard input in the title and paste text fields', async () => {
    const user = userEvent.setup()
    const windowKeydown = vi.fn()
    window.addEventListener('keydown', windowKeydown)

    try {
      render(<ImportPanel settings={settings} onSave={vi.fn()} onCancel={vi.fn()} />)

      const title = screen.getByLabelText('Title') as HTMLInputElement
      const body = screen.getByLabelText('Paste your text below') as HTMLTextAreaElement

      await user.type(title, 'A typed title')
      await user.type(body, 'Alpha beta gamma')

      expect(title.value).toBe('A typed title')
      expect(body.value).toBe('Alpha beta gamma')
      expect(windowKeydown).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', windowKeydown)
    }
  })

  it('stores content_display for a hard-wrapped .txt import', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    ;(window as unknown as { api: unknown }).api = {
      file: {
        open: vi.fn().mockResolvedValue({
          fileName: 'poem.txt',
          title: 'Poem',
          // parseTxt now preserves layout — single newlines reach ImportPanel intact
          content: 'Roses are red,\nViolets are blue,\n\nSugar is sweet.',
          warnings: [],
          ext: 'txt',
          diagnostics: {
            parser: 'node:utf8',
            sourceExtension: 'txt',
            fileSizeBytes: 50,
            charCount: 50,
            wordCount: 10,
            paragraphCount: 2,
            cleanupActions: [{ type: 'lineEndings', count: 1 }],
            suspiciousSignals: [],
          },
          blocks: undefined,
          pages: undefined,
          html: null,
        }),
      },
    }

    render(<ImportPanel settings={settings} onSave={onSave} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: 'Upload File' }))
    await user.click(screen.getByRole('button', { name: 'Drop file here or click to browse' }))

    await screen.findByLabelText('Review extracted text')
    await user.click(screen.getByRole('button', { name: 'Save & Open in Reader' }))

    // Reading content reflows soft wraps; display content preserves intra-paragraph newlines
    expect(onSave).toHaveBeenCalledWith(
      'Poem',
      'Roses are red, Violets are blue,\n\nSugar is sweet.',
      expect.objectContaining({
        sourceType: 'text',
        displayContent: 'Roses are red,\nViolets are blue,\n\nSugar is sweet.',
      }),
      expect.objectContaining({ segmentation_enabled: false, auto_chapter_detection: false }),
      undefined
    )
  })

  it('shows an editable file preview and saves the edited text', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    ;(window as unknown as { api: unknown }).api = {
      file: {
        open: vi.fn().mockResolvedValue({
          fileName: 'sample.pdf',
          title: 'Sample',
          content: 'Original extracted text with enough words',
          warnings: ['Low word density'],
          ext: 'pdf',
          pageCount: 2,
          diagnostics: {
            parser: 'pdf-parse/layout',
            sourceExtension: 'pdf',
            fileSizeBytes: 123,
            charCount: 41,
            wordCount: 6,
            paragraphCount: 1,
            pageCount: 2,
            cleanupActions: [{ type: 'lineEndings', count: 1 }],
            suspiciousSignals: [],
          },
          blocks: undefined,
          pages: [],
          html: null,
        }),
      },
    }

    render(<ImportPanel settings={settings} onSave={onSave} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: 'Upload File' }))
    await user.click(screen.getByRole('button', { name: 'Drop file here or click to browse' }))

    const preview = await screen.findByLabelText('Review extracted text')
    expect((preview as HTMLTextAreaElement).value).toBe('Original extracted text with enough words')
    expect(screen.getByText('Import diagnostics:')).toBeTruthy()

    await user.clear(preview)
    await user.type(preview, 'Edited extracted text with enough words now')
    await user.click(screen.getByRole('button', { name: 'Save & Open in Reader' }))

    expect(onSave).toHaveBeenCalledWith(
      'Sample',
      'Edited extracted text with enough words now',
      expect.objectContaining({
        sourceType: 'pdf',
        pageCount: 2,
        diagnostics: expect.objectContaining({ parser: 'pdf-parse/layout' }),
      }),
      expect.objectContaining({ segmentation_enabled: false, auto_chapter_detection: false }),
      undefined
    )
  })

  it('omits Create Video Without Saving button when prop is absent (mirrors importTileCreateVideoEnabled: false at AppShellMainContent)', () => {
    // AppShellMainContent passes undefined when importTileCreateVideoEnabled is false;
    // ImportPanel already gates on prop presence — this test documents that contract.
    render(<ImportPanel settings={settings} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /create video without saving/i })).toBeNull()
  })

  it('hides Text Processing section and forces seg off even when settings prop has it enabled', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    // settings has segmentation_enabled: true — the flag must coerce it to false
    render(<ImportPanel settings={settings} onSave={onSave} onCancel={vi.fn()} />)

    // Section and toggle must not be rendered under the default (false) flag
    expect(screen.queryByText('Text Processing')).toBeNull()
    expect(screen.queryByLabelText('Auto-segment long texts')).toBeNull()

    // Fill in title + body so handleSubmit succeeds
    const title = screen.getByLabelText('Title')
    const body = screen.getByLabelText('Paste your text below')
    await user.type(title, 'Test title')
    await user.type(body, 'Alpha beta gamma delta epsilon')
    await user.click(screen.getByRole('button', { name: 'Save & Open in Reader' }))

    expect(onSave).toHaveBeenCalledWith(
      'Test title',
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ segmentation_enabled: false, auto_chapter_detection: false }),
      undefined
    )
  })
})
