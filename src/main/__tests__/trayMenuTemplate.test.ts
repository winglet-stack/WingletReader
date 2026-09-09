import { describe, expect, it, vi } from 'vitest'
import { buildTrayMenuTemplate } from '../trayMenuTemplate'

function makeOptions(rwwEnabled: boolean) {
  return {
    rwwEnabled,
    onShow: vi.fn(),
    onStartReadWhileWorking: vi.fn(),
    onExitReadWhileWorking: vi.fn(),
    onQuit: vi.fn()
  }
}

describe('buildTrayMenuTemplate', () => {
  it('offers Start Overlay Reader while the mode is disarmed', () => {
    const template = buildTrayMenuTemplate(makeOptions(false))

    expect(template.map((item) => item.label)).toEqual([
      'Show WingletReader',
      'Start Overlay Reader',
      'Quit'
    ])
  })

  it('offers Exit Overlay Reader while the mode is armed', () => {
    const template = buildTrayMenuTemplate(makeOptions(true))

    expect(template.map((item) => item.label)).toEqual([
      'Show WingletReader',
      'Exit Overlay Reader',
      'Quit'
    ])
  })

  it('keeps Show first and Quit last in both states', () => {
    for (const rwwEnabled of [false, true]) {
      const template = buildTrayMenuTemplate(makeOptions(rwwEnabled))

      expect(template).toHaveLength(3)
      expect(template[0].label).toBe('Show WingletReader')
      expect(template[2].label).toBe('Quit')
    }
  })

  it('wires the disarmed items to show, start and quit', () => {
    const options = makeOptions(false)
    const template = buildTrayMenuTemplate(options)

    template[0].click()
    template[1].click()
    template[2].click()

    expect(options.onShow).toHaveBeenCalledOnce()
    expect(options.onStartReadWhileWorking).toHaveBeenCalledOnce()
    expect(options.onQuit).toHaveBeenCalledOnce()
    expect(options.onExitReadWhileWorking).not.toHaveBeenCalled()
  })

  it('wires the armed middle item to exit, not start', () => {
    const options = makeOptions(true)
    const template = buildTrayMenuTemplate(options)

    template[1].click()

    expect(options.onExitReadWhileWorking).toHaveBeenCalledOnce()
    expect(options.onStartReadWhileWorking).not.toHaveBeenCalled()
  })

  it('reads rwwEnabled once, at build time — the template is a snapshot', () => {
    const options = makeOptions(false)
    const template = buildTrayMenuTemplate(options)
    options.rwwEnabled = true

    expect(template[1].label).toBe('Start Overlay Reader')
  })
})
