import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { autoTextColor } from '../engine/highlightColor'
import { ReaderCountdown } from '../components/reader/StageOverlays'

afterEach(() => {
  cleanup()
})

function renderCountdownForViewportBg(viewportBgColor: string) {
  render(<ReaderCountdown countdown={3} color={autoTextColor(viewportBgColor)} />)
  return screen
    .getByLabelText('Reading resumes in')
    .style
    .getPropertyValue('--reader-countdown-color')
}

describe('ReaderCountdown', () => {
  it('uses max-contrast text color for light and dark viewport backgrounds', () => {
    expect(renderCountdownForViewportBg('#ffffff')).toBe('#000000')

    cleanup()

    expect(renderCountdownForViewportBg('#000000')).toBe('#ffffff')
  })
})
