/**
 * Reading goals inline group on the Settings landing (ADR-0035 §5–§6).
 *
 * Pins the two things the group is responsible for: the page↔word contract
 * (the store holds words, the user sets quota pages, and a legacy value that is
 * not a multiple of 500 displays rounded up without being rewritten), and the
 * auto-save/reload behaviour every other landing control already has.
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QUOTA_PAGE_WORDS } from '../../../shared/statsMath'
import { DEFAULT_SETTINGS } from '../types'
import type { Settings } from '../types'

vi.mock('../contexts/NavigationContext', () => ({
  useNavigation: () => ({ settingsSubview: null, setSettingsSubview: vi.fn() }),
}))

import ReadingGoalsGroup from '../components/settings/ReadingGoalsGroup'
import GlobalSettingsBody from '../components/settings/GlobalSettingsBody'

afterEach(cleanup)

function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides } as Settings
}

/** The `[− n +]` group for one goal, addressed by its accessible name. */
function stepper(label: string) {
  const group = screen.getByRole('group', { name: label })
  return {
    input: within(group).getByLabelText(`${label} value`) as HTMLInputElement,
    minus: within(group).getByLabelText(`Decrease ${label}`) as HTMLButtonElement,
    plus: within(group).getByLabelText(`Increase ${label}`) as HTMLButtonElement,
  }
}

/**
 * The group's derived reading of the quota. Built with the same
 * `toLocaleString()` the whole app formats word counts with, so the suite pins
 * the wording and the numbers without pinning the machine's thousands
 * separator (this repo's CI runs under a `de-DE` default).
 */
function quotaText(pages: number): string {
  const unit = pages === 1 ? 'page' : 'pages'
  return `${pages} ${unit} · ${(pages * QUOTA_PAGE_WORDS).toLocaleString()} words`
}

/** Type a value into a stepper box and commit it the way a user would (blur). */
function typeAndCommit(input: HTMLInputElement, raw: string) {
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: raw } })
  fireEvent.blur(input)
}

describe('Reading goals group — rendering', () => {
  it('renders both goal steppers from the stored settings', () => {
    render(<ReadingGoalsGroup local={settings()} update={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Reading goals' })).toBeTruthy()
    // Default quota is 1,000 words — two quota pages.
    expect(stepper('Daily quota').input.value).toBe('2')
    expect(screen.getByText(quotaText(2))).toBeTruthy()
    expect(stepper('Weekly target').input.value).toBe('5')
    expect(screen.getByText('5 days a week')).toBeTruthy()
  })

  it('shows the page unit and its word consequence for a one-page quota', () => {
    render(<ReadingGoalsGroup local={settings({ daily_word_quota: 500 })} update={vi.fn()} />)

    expect(stepper('Daily quota').input.value).toBe('1')
    expect(screen.getByText(quotaText(1))).toBeTruthy()
  })

  it('says "1 day a week" rather than "1 days"', () => {
    render(<ReadingGoalsGroup local={settings({ weekly_quota_days: 1 })} update={vi.fn()} />)

    expect(screen.getByText('1 day a week')).toBeTruthy()
  })

  it('sits on the Settings landing, below the card grid', () => {
    const { container } = render(
      <GlobalSettingsBody
        local={settings()}
        update={vi.fn()}
        onExport={vi.fn()}
        onImport={vi.fn()}
        onOpenReaderDefaults={vi.fn()}
      />
    )

    const grid = container.querySelector('.rdc-grid')!
    const goals = container.querySelector('.settings-goals')!
    expect(goals).toBeTruthy()
    // No new gateway card: the grid still holds exactly its five cards.
    expect(grid.children.length).toBe(5)
    expect(grid.compareDocumentPosition(goals) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(goals as HTMLElement).getByRole('group', { name: 'Daily quota' })).toBeTruthy()
    expect(within(goals as HTMLElement).getByRole('group', { name: 'Weekly target' })).toBeTruthy()
  })
})

describe('Reading goals group — persistence', () => {
  it('writes the quota in words: pages × 500', () => {
    const update = vi.fn()
    render(<ReadingGoalsGroup local={settings({ daily_word_quota: 1000 })} update={update} />)

    fireEvent.click(stepper('Daily quota').plus)
    expect(update).toHaveBeenCalledWith({ daily_word_quota: 3 * QUOTA_PAGE_WORDS })

    fireEvent.click(stepper('Daily quota').minus)
    expect(update).toHaveBeenLastCalledWith({ daily_word_quota: 1 * QUOTA_PAGE_WORDS })
  })

  it('writes the weekly target in days', () => {
    const update = vi.fn()
    render(<ReadingGoalsGroup local={settings({ weekly_quota_days: 5 })} update={update} />)

    fireEvent.click(stepper('Weekly target').plus)
    expect(update).toHaveBeenCalledWith({ weekly_quota_days: 6 })

    fireEvent.click(stepper('Weekly target').minus)
    expect(update).toHaveBeenLastCalledWith({ weekly_quota_days: 4 })
  })

  it('writes nothing on render — a stored value is never rewritten by display', () => {
    const update = vi.fn()
    render(<ReadingGoalsGroup local={settings({ daily_word_quota: 1200 })} update={update} />)

    expect(update).not.toHaveBeenCalled()
  })

  it('reloads from the settings it is given', () => {
    const { rerender } = render(<ReadingGoalsGroup local={settings()} update={vi.fn()} />)
    expect(stepper('Daily quota').input.value).toBe('2')

    rerender(
      <ReadingGoalsGroup
        local={settings({ daily_word_quota: 4000, weekly_quota_days: 3 })}
        update={vi.fn()}
      />
    )
    expect(stepper('Daily quota').input.value).toBe('8')
    expect(screen.getByText(quotaText(8))).toBeTruthy()
    expect(stepper('Weekly target').input.value).toBe('3')
  })
})

describe('Reading goals group — range', () => {
  it('disables the quota edges at 1 and 20 pages', () => {
    const { rerender } = render(
      <ReadingGoalsGroup local={settings({ daily_word_quota: 500 })} update={vi.fn()} />
    )
    expect(stepper('Daily quota').minus.disabled).toBe(true)
    expect(stepper('Daily quota').plus.disabled).toBe(false)

    rerender(<ReadingGoalsGroup local={settings({ daily_word_quota: 10_000 })} update={vi.fn()} />)
    expect(stepper('Daily quota').plus.disabled).toBe(true)
    expect(stepper('Daily quota').minus.disabled).toBe(false)
  })

  it('disables the weekly-target edges at 1 and 7 days', () => {
    const { rerender } = render(
      <ReadingGoalsGroup local={settings({ weekly_quota_days: 1 })} update={vi.fn()} />
    )
    expect(stepper('Weekly target').minus.disabled).toBe(true)

    rerender(<ReadingGoalsGroup local={settings({ weekly_quota_days: 7 })} update={vi.fn()} />)
    expect(stepper('Weekly target').plus.disabled).toBe(true)
  })

  it('clamps a typed-in value to the range before writing', () => {
    const update = vi.fn()
    render(<ReadingGoalsGroup local={settings()} update={update} />)

    typeAndCommit(stepper('Daily quota').input, '99')
    expect(update).toHaveBeenLastCalledWith({ daily_word_quota: 20 * QUOTA_PAGE_WORDS })

    typeAndCommit(stepper('Daily quota').input, '0')
    expect(update).toHaveBeenLastCalledWith({ daily_word_quota: 1 * QUOTA_PAGE_WORDS })

    typeAndCommit(stepper('Weekly target').input, '12')
    expect(update).toHaveBeenLastCalledWith({ weekly_quota_days: 7 })
  })

  it('displays an out-of-range stored value clamped, without rewriting it', () => {
    const update = vi.fn()
    render(
      <ReadingGoalsGroup
        local={settings({ daily_word_quota: 50_000, weekly_quota_days: 0 })}
        update={update}
      />
    )

    expect(stepper('Daily quota').input.value).toBe('20')
    expect(stepper('Weekly target').input.value).toBe('1')
    expect(update).not.toHaveBeenCalled()
  })
})

describe('Reading goals group — legacy word quotas', () => {
  it('displays a non-multiple-of-500 quota as rounded-up quota pages', () => {
    render(<ReadingGoalsGroup local={settings({ daily_word_quota: 1200 })} update={vi.fn()} />)

    expect(stepper('Daily quota').input.value).toBe('3')
    expect(screen.getByText(quotaText(3))).toBeTruthy()
  })

  it('rewrites the exact words only once the user changes the value', () => {
    const update = vi.fn()
    render(<ReadingGoalsGroup local={settings({ daily_word_quota: 1200 })} update={update} />)

    // 1,200 reads as 3 pages, so "+" steps to 4 pages = 2,000 words — the first
    // moment the odd stored value is normalized.
    fireEvent.click(stepper('Daily quota').plus)
    expect(update).toHaveBeenCalledWith({ daily_word_quota: 2000 })
  })

  it('steps down from a rounded-up legacy value to the page below it', () => {
    const update = vi.fn()
    render(<ReadingGoalsGroup local={settings({ daily_word_quota: 1200 })} update={update} />)

    fireEvent.click(stepper('Daily quota').minus)
    expect(update).toHaveBeenCalledWith({ daily_word_quota: 1000 })
  })
})
