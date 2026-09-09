import React from 'react'
import type { MainContentModel } from './useAppShellMainContentModel'

interface AppShellMainContentProps {
  model: MainContentModel
  children: React.ReactNode
}

/**
 * The shell's main content region: the shared toast plus whatever the route
 * table said renders the active destination. The `view` dispatch itself lives in
 * `appShell/routeTable.tsx`, so this file has no knowledge of the destinations.
 */
export default function AppShellMainContent({ model, children }: AppShellMainContentProps) {
  const { error, dismissError } = model

  return (
    <main className="main-content">
      {error && (
        <div
          className={`toast ${error.startsWith('✓') ? 'toast-success' : 'toast-error'}`}
          role="alert"
        >
          <span>{error}</span>
          <button className="toast-close" onClick={dismissError} aria-label="Dismiss">x</button>
        </div>
      )}

      {children}
    </main>
  )
}
