import React from 'react'
import { NavigationProvider } from './contexts/NavigationContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { LibraryProvider } from './contexts/LibraryContext'
import { ReaderProvider } from './contexts/ReaderContext'
import AppShell from './AppShell'

export default function App() {
  return (
    <NavigationProvider>
      <SettingsProvider>
        <LibraryProvider>
          <ReaderProvider>
            <AppShell />
          </ReaderProvider>
        </LibraryProvider>
      </SettingsProvider>
    </NavigationProvider>
  )
}
