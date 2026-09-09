import type React from 'react'
import { useEffect } from 'react'

export interface OutsideDismissOptions {
  open: boolean
  containerRef: React.RefObject<HTMLElement>
  /** While true, outside mousedown is ignored (a modal pick is in flight). */
  suppressed?: boolean
  onDismiss: () => void
}

/**
 * Dismiss a surface on mousedown outside its container. Escape is deliberately
 * not handled here — the Reader owns that cascade.
 */
export function useOutsideDismiss({
  open,
  containerRef,
  suppressed = false,
  onDismiss,
}: OutsideDismissOptions): void {
  useEffect(() => {
    if (!open) return

    const handleMouseDown = (event: MouseEvent) => {
      if (suppressed) return
      const container = containerRef.current
      if (container && !container.contains(event.target as Node)) {
        onDismiss()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [containerRef, onDismiss, open, suppressed])
}
