import React from 'react'

export const MAIN_PROCESS_LOG_PATH = String.raw`%APPDATA%\WingletReader\logs\main.log`

interface ErrorBoundaryProps {
  children: React.ReactNode
  reload?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Renderer error boundary caught an error:', error, errorInfo)
  }

  private handleReload = (): void => {
    if (this.props.reload) {
      this.props.reload()
      return
    }
    window.location.reload()
  }

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="error-boundary" role="alert">
        <section className="error-boundary__panel">
          <p className="error-boundary__eyebrow">WingletReader</p>
          <h1>Something went wrong</h1>
          <p className="error-boundary__copy">
            Reload the app to recover. If this keeps happening, send the log file to the maintainer.
          </p>
          <button className="btn-primary error-boundary__reload" type="button" onClick={this.handleReload}>
            Reload
          </button>
          <div className="error-boundary__log">
            <span>Log location</span>
            <code>{MAIN_PROCESS_LOG_PATH}</code>
          </div>
        </section>
      </main>
    )
  }
}
