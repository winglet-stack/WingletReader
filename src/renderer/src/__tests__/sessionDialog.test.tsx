import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SessionDialog, { type SessionDialogProps, type SessionDialogVariant } from '../components/reader/SessionDialog'

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
