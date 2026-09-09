import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SessionDialog, { type SessionDialogProps, type SessionDialogVariant } from '../components/reader/SessionDialog'
import type {
  SessionBaseline,
  SessionMetrics,
  SessionStatsSummary,
} from '../../../shared/statsMath'

const MINUTE = 60_000

/**
 * The finished session's numbers as the Reader hands them down (ADR-0035 §6).
 * Values are chosen so every displayed figure is exact: 600 words in 6 active
 * minutes is 100 wpm, and the deviations below land on whole percents.
 */
function metrics(overrides: Partial<SessionMetrics> = {}): SessionMetrics {
  return {
    wordsRead: 600,
    wallMs: 8 * MINUTE,
    activeMs: 6 * MINUTE,
    pauses: 2,
    rewinds: 1,
    wpm: 100,
    fluency: 60,
    ...overrides,
  }
}

function baseline(overrides: Partial<SessionBaseline> = {}): SessionBaseline {
  return {
    source: 'today',
    sessionCount: 2,
    date: null,
    wordsRead: 500,
    wallMs: 10 * MINUTE,
    activeMs: 8 * MINUTE,
    pauses: 2,
    rewinds: 2,
    wpm: 80,
    fluency: 50,
    ...overrides,
  }
}

function sessionStats(overrides: Partial<SessionStatsSummary> = {}): SessionStatsSummary {
  return { metrics: metrics(), baseline: null, ...overrides }
}

/** The tile a metric label sits in — label, value and any deviation together. */
function statTile(label: string): HTMLElement {
  return screen.getByText(label).closest('.session-dialog-stat') as HTMLElement
}

function callbacks() {
  return {
    onSaveExit: vi.fn(),
    onExitWithoutSaving: vi.fn(),
    onAbort: vi.fn(),
    onContinue: vi.fn(),
    onSetNewTarget: vi.fn(),
    onDismiss: vi.fn(),
  }
}

function renderSessionDialog(
  variant: SessionDialogVariant,
  overrides: Partial<SessionDialogProps> = {},
) {
  const handlers = callbacks()
  render(
    <SessionDialog
      variant={variant}
      progressPercent={42}
      wordsRead={1234}
      totalWords={2500}
      {...handlers}
      {...overrides}
    />,
  )
  return handlers
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SessionDialog', () => {
  it.each([
    {
      variant: 'stop' as const,
      title: 'Stop reading?',
      actions: [
        ['Save & Exit', 'session-dialog-action--primary'],
        ['Exit without saving', 'session-dialog-action--danger'],
        ['Abort', 'session-dialog-action--ghost'],
      ],
    },
    {
      variant: 'goal' as const,
      title: 'Target reached',
      actions: [
        ['Continue reading', 'session-dialog-action--primary'],
        ['Set a new target', 'session-dialog-action--secondary'],
        ['Save & Exit', 'session-dialog-action--primary'],
        ['Exit without saving', 'session-dialog-action--danger'],
      ],
    },
    {
      variant: 'end' as const,
      title: 'Finished',
      actions: [
        ['Save & Exit', 'session-dialog-action--primary'],
        ['Exit without saving', 'session-dialog-action--danger'],
      ],
    },
  ])('renders the $variant variant action stack', ({ variant, title, actions }) => {
    renderSessionDialog(variant)

    // Format the expected numbers the same way the component does
    // (Number.toLocaleString) so the assertion is locale-independent: the
    // grouping separator is a comma under en-US but a period under, e.g.,
    // de-DE, and the runner's locale must not decide whether this test passes.
    const expectedWords = `${(1234).toLocaleString()} of ${(2500).toLocaleString()} words`

    expect(screen.getByRole('dialog', { name: title })).toBeTruthy()
    expect(screen.getByText('42%')).toBeTruthy()
    expect(screen.getByText(expectedWords)).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(document.body.textContent).not.toContain('Goal')

    const buttons = within(screen.getByRole('dialog')).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(
      actions.map(([label]) => label),
    )

    actions.forEach(([, className], index) => {
      expect(buttons[index].className).toContain(className)
    })
  })

  it.each(['stop', 'goal', 'end'] as const)(
    'renders the six session metrics in the %s variant',
    (variant) => {
      renderSessionDialog(variant, { sessionStats: sessionStats() })

      const dialog = within(screen.getByRole('dialog'))
      expect(dialog.getByText('This session')).toBeTruthy()

      const expected: [string, string][] = [
        ['Words', (600).toLocaleString()],
        ['Duration', '8m 0s'],
        ['Speed', `${(100).toLocaleString()} wpm`],
        ['Pauses', '2'],
        ['Rewinds', '1'],
        ['Fluency', '60'],
      ]
      expected.forEach(([label, value]) => {
        expect(statTile(label).textContent).toContain(value)
      })

      // Nothing to compare against: no arrows, no caption.
      expect(screen.getByRole('dialog').textContent).not.toContain('vs your')
      expect(screen.queryAllByRole('img')).toEqual([])
    },
  )

  it("deviates against today's earlier sessions when there are any", () => {
    renderSessionDialog('end', { sessionStats: sessionStats({ baseline: baseline() }) })

    expect(screen.getByText('vs your 2 earlier sessions today')).toBeTruthy()
    expect(statTile('Words').textContent).toContain('▲ 20%')
    expect(statTile('Duration').textContent).toContain('▼ 20%')
    expect(statTile('Speed').textContent).toContain('▲ 25%')
    expect(statTile('Rewinds').textContent).toContain('▼ 50%')
    expect(statTile('Fluency').textContent).toContain('▲ 20%')
    // Identical to the baseline: an indicator would say nothing.
    expect(statTile('Pauses').textContent).not.toContain('%')

    // The glyph is decorative; the direction is spoken (Words and Fluency both
    // rose by a fifth).
    expect(screen.getAllByLabelText('up 20 percent')).toHaveLength(2)
  })

  it('keeps the action buttons the only focusable elements when the block is shown', () => {
    renderSessionDialog('stop', { sessionStats: sessionStats({ baseline: baseline() }) })

    const dialog = screen.getByRole('dialog')
    const focusable = dialog.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    expect(focusable).toHaveLength(3)
    expect(document.activeElement).toBe(within(dialog).getAllByRole('button')[0])
  })

  it('names the prior-day rung and drops a metric with a zero baseline', () => {
    renderSessionDialog('stop', {
      sessionStats: sessionStats({
        metrics: metrics({ pauses: 3 }),
        baseline: baseline({ source: 'prior-day', sessionCount: 4, date: '2026-08-11', pauses: 0 }),
      }),
    })

    expect(screen.getByText('vs your last reading day')).toBeTruthy()
    expect(statTile('Pauses').textContent).toBe('Pauses3')
  })

  it("says 'session' in the singular for a single earlier session today", () => {
    renderSessionDialog('end', {
      sessionStats: sessionStats({ baseline: baseline({ sessionCount: 1 }) }),
    })

    expect(screen.getByText('vs your earlier session today')).toBeTruthy()
  })

  it('omits the block entirely when the session recorded nothing', () => {
    renderSessionDialog('end')

    expect(screen.queryByText('This session')).toBeNull()
    expect(document.querySelector('.session-dialog-stats')).toBeNull()
  })

  it('formats durations by magnitude', () => {
    renderSessionDialog('end', {
      sessionStats: sessionStats({ metrics: metrics({ wallMs: 3 * 3600_000 + 4 * MINUTE + 5_000 }) }),
    })
    expect(statTile('Duration').textContent).toContain('3h 4m 5s')

    cleanup()

    renderSessionDialog('end', { sessionStats: sessionStats({ metrics: metrics({ wallMs: 45_000 }) }) })
    expect(statTile('Duration').textContent).toContain('45s')
  })

  it('maps Escape and backdrop dismissal by variant', () => {
    const stopHandlers = renderSessionDialog('stop')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(stopHandlers.onAbort).toHaveBeenCalledOnce()
    expect(stopHandlers.onDismiss).not.toHaveBeenCalled()

    cleanup()

    const stopBackdropHandlers = renderSessionDialog('stop')
    fireEvent.click(screen.getByRole('dialog').parentElement!)
    expect(stopBackdropHandlers.onAbort).toHaveBeenCalledOnce()
    expect(stopBackdropHandlers.onDismiss).not.toHaveBeenCalled()

    cleanup()

    const goalHandlers = renderSessionDialog('goal')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(goalHandlers.onDismiss).toHaveBeenCalledOnce()
    expect(goalHandlers.onAbort).not.toHaveBeenCalled()

    cleanup()

    const endHandlers = renderSessionDialog('end')
    fireEvent.click(screen.getByRole('dialog').parentElement!)
    expect(endHandlers.onDismiss).toHaveBeenCalledOnce()
    expect(endHandlers.onAbort).not.toHaveBeenCalled()
  })

  it('traps focus, swallows Space, activates focused action on Enter, and restores focus', async () => {
    const user = userEvent.setup()
    const invoker = document.createElement('button')
    invoker.textContent = 'Invoker'
    document.body.appendChild(invoker)
    invoker.focus()

    const handlers = callbacks()
    const { unmount } = render(
      <SessionDialog
        variant="goal"
        progressPercent={64}
        wordsRead={1800}
        {...handlers}
      />,
    )

    const buttons = within(screen.getByRole('dialog')).getAllByRole('button')
    expect(document.activeElement).toBe(buttons[0])

    fireEvent.keyDown(document, { key: ' ', code: 'Space' })
    fireEvent.keyUp(document, { key: ' ', code: 'Space' })
    expect(handlers.onContinue).not.toHaveBeenCalled()
    expect(handlers.onSaveExit).not.toHaveBeenCalled()
    expect(handlers.onExitWithoutSaving).not.toHaveBeenCalled()

    buttons[1].focus()
    await user.keyboard('{Enter}')
    expect(handlers.onSetNewTarget).toHaveBeenCalledOnce()

    buttons[0].focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(buttons[buttons.length - 1])

    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(buttons[0])

    unmount()
    expect(document.activeElement).toBe(invoker)
    invoker.remove()
  })
})
