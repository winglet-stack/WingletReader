/**
 * The Text Processing section with its chrome flag on (codebase-health 08).
 *
 * Its own file because `alphaChrome.importTextProcessingEnabled` is a module
 * constant: the flag-off case (the shipped alpha v1 surface) lives in
 * `importFormParts.test.tsx`, and this file mocks the flag on to cover the
 * markup behind it.
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImportTextProcessingSection from '../components/import/ImportTextProcessingSection'

vi.mock('../alphaChrome', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../alphaChrome')>()
  return {
    ...actual,
    alphaChrome: { ...actual.alphaChrome, importTextProcessingEnabled: true }
  }
})

afterEach(cleanup)

describe('ImportTextProcessingSection (chrome enabled)', () => {
  it('offers both toggles', () => {
    render(
      <ImportTextProcessingSection
        segEnabled
        onSegEnabledChange={vi.fn()}
        chapterDetect={false}
        onChapterDetectChange={vi.fn()}
      />
    )

    expect(screen.getByText('Text Processing')).toBeTruthy()
    expect(screen.getByText('Auto-segment long texts')).toBeTruthy()
    expect(screen.getByText('Auto chapter detection')).toBeTruthy()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('locks chapter detection behind segmentation', () => {
    render(
      <ImportTextProcessingSection
        segEnabled={false}
        onSegEnabledChange={vi.fn()}
        chapterDetect={false}
        onChapterDetectChange={vi.fn()}
      />
    )

    const [, chapterDetect] = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(chapterDetect.disabled).toBe(true)
  })

  it('reports a chapter-detection change once segmentation is on', async () => {
    const user = userEvent.setup()
    const onChapterDetectChange = vi.fn()
    render(
      <ImportTextProcessingSection
        segEnabled
        onSegEnabledChange={vi.fn()}
        chapterDetect={false}
        onChapterDetectChange={onChapterDetectChange}
      />
    )

    const [, chapterDetect] = screen.getAllByRole('checkbox') as HTMLInputElement[]
    await user.click(chapterDetect)

    expect(onChapterDetectChange).toHaveBeenCalledWith(true)
  })
})
