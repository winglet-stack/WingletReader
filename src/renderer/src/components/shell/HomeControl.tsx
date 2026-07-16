import React from 'react'
import { HOME_DOVE_ASSET_URL } from '../../constants/homeDoveAsset'

interface HomeControlProps {
  onNavigateHome: () => void
}

/**
 * Persistent Home control (ADR-0011 slice 04).
 *
 * Fixed top-left dove on inner screens; additive to screen-local backs.
 * The Reader is exempt — mount only from AppShell when view !== 'reader'.
 *
 * Slice 04 agent: retire ShellTopBar's wordmark home once this is wired app-wide;
 * audit overlap on every inner view; extend readWhileWorking integration tests.
 */
export default function HomeControl({ onNavigateHome }: HomeControlProps) {
  return (
    <button
      type="button"
      className="home-control"
      onClick={onNavigateHome}
      aria-label="Go to home"
      title="Return to hub"
    >
      <img className="home-control-dove" src={HOME_DOVE_ASSET_URL} alt="" aria-hidden="true" />
    </button>
  )
}
