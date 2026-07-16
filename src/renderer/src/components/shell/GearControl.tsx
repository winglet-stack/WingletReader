import React from 'react'

interface GearControlProps {
  onOpenSettings: () => void
}

/**
 * Persistent Settings control (ADR-0011 issue 05).
 *
 * Fixed top-right gear on inner screens. Mirror of HomeControl (top-left dove).
 * AppShell mounts this only where Settings is a useful shortcut.
 */
export default function GearControl({ onOpenSettings }: GearControlProps) {
  return (
    <button
      type="button"
      className="gear-control"
      onClick={onOpenSettings}
      aria-label="Open Settings"
      title="Settings"
    >
      <span aria-hidden="true">&#9881;</span>
    </button>
  )
}
