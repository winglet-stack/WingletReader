import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './ErrorBoundary'
import StandbyPill from './components/StandbyPill'
import TemporaryReaderApp from './components/TemporaryReaderApp'
import './index.css'

const searchParams = new URLSearchParams(window.location.search)
const Root = searchParams.has('standbyPill')
  ? StandbyPill
  : searchParams.has('temporaryReader')
    ? TemporaryReaderApp
    : App

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
)
