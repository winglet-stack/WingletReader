# Archived Code

This directory contains code for features that were built but are no longer active. The code is preserved here rather than deleted for reference and potential future use.

See [ADR-0004](../../../../docs/adr/0004-dead-code-archived-not-deleted.md) for the rationale.

## Contents

### Trailer Reader
A preview reading mode that condensed a text into key sections (headings, bold terms, questions, summary) and played them back before the full read. Gutted due to high implementation complexity relative to usage.

Files:
- `components/TrailerReader.tsx`
- `engine/trailerTokenizer.ts`
- `engine/__tests__/trailerTokenizer.test.ts`
- `hooks/useTrailerPlayback.ts`

### Primer Panel
A pre-reading summary generator that extracted headings, bolded terms, visual aid references, questions, and a summary from the imported text. Removed from active navigation because the extraction heuristics had too high a margin of error.

Files:
- `components/PrimerPanel.tsx`
- `engine/textPrimer.ts`

### Script Builder

A standalone script-assembly and playback UI: compose timed word-stack sequences, preview at target BPM, and export as MP4. Unwired from `AppShell.tsx` and archived because the feature was never wired up end-to-end with the library data layer.

Files:
- `components/ScriptBuilder.tsx`
- `engine/scriptBuilder.ts`
- `engine/scriptTypes.ts`
- `engine/__tests__/scriptBuilder.test.ts`
- `hooks/useScriptPlayback.ts`

### Summary View
A full-page summaries browser for a text: view, edit, and manage reading-session summaries and follow-up questions. Removed from active navigation in wave-1 Library flatten (issue 01). Post-reading summary modals are off for alpha v1 (`alphaChrome.postReadingSummaryEnabled: false`; Pass 2 **01**).

Files:
- `components/SummaryView.tsx`

### FastTrack Showcase
A splash screen that introduced the app before the mode-choice fork. Removed from active navigation in Pass 2 issue 03 (alpha dead routes). Cold start now lands on Library directly.

Files:
- `components/FastTrackShowcase.tsx`

### Mode Choice Screen
A startup Library-vs-Read-While-Working fork. Removed from active navigation in Pass 2 issue 03. RWW entry now lives on the Library header button and tray; RWW exit returns to Library via `NavigationContext`.

Files:
- `components/ModeChoiceScreen.tsx`

## Notes

- The active shell (`AppShell.tsx`, `AppShellMainContent.tsx`) no longer imports archived components. Dead `AppView` tokens still redirect to Library via `alphaChrome.resolveAlphaView`.
- Import paths in these files reference the main source tree (`../../engine/`, `../../types`, etc.) for shared utilities.
