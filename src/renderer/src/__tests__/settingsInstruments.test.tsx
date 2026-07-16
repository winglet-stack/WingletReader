/**
 * Unit tests for the shared settings instruments (issue 01):
 *   - SliderField — live/persist split + the optional non-linear value↔slider
 *     transform (the BPM/Target-WPM mappings these sliders must preserve).
 *   - Stepper — clamped [− n +] with optional type-in.
 *   - Segmented — active-pill enum row.
 *
 * Environment: happy-dom (vitest.config.ts environmentMatchGlobs).
 */

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import SliderField from '../components/settings/instruments/SliderField'
import Stepper from '../components/settings/instruments/Stepper'
import Segmented from '../components/settings/instruments/Segmented'
import {
  BPM_SLIDER_TRANSFORM,
  TARGET_WPM_SLIDER_TRANSFORM,
} from '../components/settings/settingMetadata'
import {
  bpmToSlider,
  sliderToBpm,
  READER_BPM_MIN,
  READER_BPM_MAX,
} from '../engine/bpmScale'
import { sliderToReaderTargetWpm } from '../engine/wpmSolver'

afterEach(cleanup)

// ── SliderField — linear ──────────────────────────────────────────────────────

describe('SliderField — linear (live/persist split)', () => {
  it('exposes the slider + numeric entry by accessible name', () => {
    render(
      <SliderField label="Font size" value={36} min={18} max={96} step={2} onLiveSet={vi.fn()} />
    )
    expect(screen.getByRole('slider', { name: 'Font size' })).toBeTruthy()
    expect(screen.getByRole('spinbutton', { name: 'Font size value' })).toBeTruthy()
  })

  it('drag previews live (onLiveSet) without persisting (onPersist)', () => {
    const onLiveSet = vi.fn()
    const onPersist = vi.fn()
    render(
      <SliderField
        label="Font size"
        value={36}
        min={18}
        max={96}
        step={2}
        onLiveSet={onLiveSet}
        onPersist={onPersist}
      />
    )
    const slider = screen.getByRole('slider', { name: 'Font size' })
    fireEvent.change(slider, { target: { value: '60' } })
    expect(onLiveSet).toHaveBeenCalledWith(60)
    expect(onPersist).not.toHaveBeenCalled()

    fireEvent.mouseUp(slider, { target: { value: '60' } })
    expect(onPersist).toHaveBeenCalledWith(60)
  })

  it('persist defaults to onLiveSet when omitted', () => {
    const onLiveSet = vi.fn()
    render(<SliderField label="Font size" value={36} min={18} max={96} onLiveSet={onLiveSet} />)
    fireEvent.mouseUp(screen.getByRole('slider', { name: 'Font size' }), {
      target: { value: '50' },
    })
    expect(onLiveSet).toHaveBeenCalledWith(50)
  })

  it('numeric entry commits a clamped value on blur', () => {
    const onLiveSet = vi.fn()
    const onPersist = vi.fn()
    render(
      <SliderField
        label="Font size"
        value={36}
        min={18}
        max={96}
        onLiveSet={onLiveSet}
        onPersist={onPersist}
      />
    )
    const numeric = screen.getByRole('spinbutton', { name: 'Font size value' })
    fireEvent.change(numeric, { target: { value: '500' } })
    fireEvent.blur(numeric)
    // 500 clamps to the max (96) on commit.
    expect(onPersist).toHaveBeenLastCalledWith(96)
  })
})

// ── SliderField — non-linear transform ────────────────────────────────────────

describe('SliderField — non-linear transform preserves BPM/Target-WPM mappings', () => {
  it('renders the slider at the transformed position, not the raw value', () => {
    render(
      <SliderField
        label="Speed"
        value={60}
        min={READER_BPM_MIN}
        max={READER_BPM_MAX}
        step={5}
        transform={BPM_SLIDER_TRANSFORM}
        onLiveSet={vi.fn()}
      />
    )
    const slider = screen.getByRole('slider', { name: 'Speed' }) as HTMLInputElement
    // Slider position is bpmToSlider(60), well below the 0–1000 raw max.
    expect(Number(slider.value)).toBe(bpmToSlider(60))
    expect(slider.max).toBe('1000')
  })

  it('maps slider movement through fromSlider for live + persist', () => {
    const onLiveSet = vi.fn()
    const onPersist = vi.fn()
    render(
      <SliderField
        label="Speed"
        value={60}
        min={READER_BPM_MIN}
        max={READER_BPM_MAX}
        step={5}
        transform={BPM_SLIDER_TRANSFORM}
        onLiveSet={onLiveSet}
        onPersist={onPersist}
      />
    )
    const slider = screen.getByRole('slider', { name: 'Speed' })
    // Full-right slider position → the BPM ceiling via the exact existing mapping.
    fireEvent.change(slider, { target: { value: '1000' } })
    expect(onLiveSet).toHaveBeenCalledWith(sliderToBpm(1000))
    expect(sliderToBpm(1000)).toBe(READER_BPM_MAX)

    fireEvent.mouseUp(slider, { target: { value: '0' } })
    expect(onPersist).toHaveBeenCalledWith(sliderToBpm(0))
    expect(sliderToBpm(0)).toBe(READER_BPM_MIN)
  })

  it('Target-WPM transform routes through the non-linear wpm solver mapping', () => {
    const onLiveSet = vi.fn()
    render(
      <SliderField
        label="Target WPM"
        value={200}
        min={0}
        max={3500}
        step={5}
        transform={TARGET_WPM_SLIDER_TRANSFORM}
        onLiveSet={onLiveSet}
      />
    )
    const slider = screen.getByRole('slider', { name: 'Target WPM' })
    fireEvent.change(slider, { target: { value: '900' } })
    expect(onLiveSet).toHaveBeenCalledWith(sliderToReaderTargetWpm(900))
  })
})

// ── Stepper ───────────────────────────────────────────────────────────────────

describe('Stepper', () => {
  it('increments and decrements by step', () => {
    const onChange = vi.fn()
    render(<Stepper label="Words per stack" value={3} min={1} max={5} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Increase Words per stack' }))
    expect(onChange).toHaveBeenLastCalledWith(4)
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Words per stack' }))
    expect(onChange).toHaveBeenLastCalledWith(2)
  })

  it('clamps a step that would overshoot the max', () => {
    const onChange = vi.fn()
    render(<Stepper label="Row gap" value={5} min={1} max={6} step={4} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Increase Row gap' }))
    // 5 + 4 = 9 clamps to the max (6).
    expect(onChange).toHaveBeenLastCalledWith(6)
  })

  it('disables the −/+ buttons at the bounds', () => {
    const { rerender } = render(
      <Stepper label="Lines" value={2} min={2} max={6} onChange={vi.fn()} />
    )
    expect((screen.getByRole('button', { name: 'Decrease Lines' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Increase Lines' }) as HTMLButtonElement).disabled).toBe(false)

    rerender(<Stepper label="Lines" value={6} min={2} max={6} onChange={vi.fn()} />)
    expect((screen.getByRole('button', { name: 'Increase Lines' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('commits a clamped integer from direct type-in on blur', () => {
    const onChange = vi.fn()
    render(<Stepper label="Words per stack" value={3} min={1} max={5} onChange={onChange} />)
    const box = screen.getByRole('spinbutton', { name: 'Words per stack value' })
    fireEvent.change(box, { target: { value: '9' } })
    fireEvent.blur(box)
    expect(onChange).toHaveBeenLastCalledWith(5)
  })

  it('renders a static value (no spinbutton) when type-in is disabled', () => {
    render(
      <Stepper label="Words per stack" value={3} min={1} max={5} onChange={vi.fn()} allowTypeIn={false} />
    )
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.getByRole('group', { name: 'Words per stack' }).textContent).toContain('3')
  })
})

// ── Segmented ─────────────────────────────────────────────────────────────────

describe('Segmented', () => {
  it('marks the active option and reports the chosen value', () => {
    const onChange = vi.fn()
    render(
      <Segmented
        label="Highlight mode"
        value="default"
        options={[
          { value: 'default', label: 'Default' },
          { value: 'progressive-bar', label: 'Progressive' },
          { value: 'panning-bar', label: 'Panning' },
        ]}
        onChange={onChange}
      />
    )
    expect(screen.getByRole('button', { name: 'Default' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Progressive' }).getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Panning' }))
    expect(onChange).toHaveBeenCalledWith('panning-bar')
  })

  it('supports boolean-valued enums', () => {
    const onChange = vi.fn()
    render(
      <Segmented
        label="Advance mode"
        value={false}
        options={[
          { value: false, label: 'BPM' },
          { value: true, label: 'Tap to Read' },
        ]}
        onChange={onChange}
      />
    )
    expect(screen.getByRole('button', { name: 'BPM' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Tap to Read' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
