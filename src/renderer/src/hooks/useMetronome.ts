import { useRef, useCallback } from 'react'

/** Generates a short click via Web Audio API. No external files needed. */
export function useMetronome() {
  const ctxRef = useRef<AudioContext | null>(null)

  const getCtx = useCallback((): AudioContext => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext()
    }
    return ctxRef.current
  }, [])

  const click = useCallback(
    (strong = false) => {
      const ctx = getCtx()
      if (ctx.state === 'suspended') ctx.resume()

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.type = 'sine'
      osc.frequency.setValueAtTime(strong ? 1200 : 900, ctx.currentTime)
      gain.gain.setValueAtTime(0.35, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06)

      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.07)
    },
    [getCtx]
  )

  const dispose = useCallback(() => {
    ctxRef.current?.close()
    ctxRef.current = null
  }, [])

  return { click, dispose }
}
