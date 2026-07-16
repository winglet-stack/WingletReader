import React from 'react'
import { SETTINGS_UP_LEVEL_ASSET_URL } from '../../constants/settingsUpLevelAsset'

interface UpLevelControlProps {
  onNavigateUp: () => void
  label: string
  title?: string
}

/**
 * Fixed top-left up-level control for nested app surfaces (ADR-0020/0027).
 * This is intentionally distinct from HomeControl: dove still only means hub.
 */
export default function UpLevelControl({ onNavigateUp, label, title }: UpLevelControlProps) {
  return (
    <button
      type="button"
      className="home-control up-level-control"
      onClick={onNavigateUp}
      aria-label={label}
      title={title ?? label}
    >
      <img
        className="up-level-control-sprite"
        src={SETTINGS_UP_LEVEL_ASSET_URL}
        alt=""
        aria-hidden="true"
      />
    </button>
  )
}
