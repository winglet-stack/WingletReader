import { useContext, useMemo, useState } from 'react'
import { LibraryContext } from '../contexts/LibraryContext'
import { NavigationContext } from '../contexts/NavigationContext'
import {
  IMPORT_BOOK_CHANNELS,
  isCommittedBook,
  offersAdd,
  type ImportBookChannel,
  type ImportBookVerdict
} from '../components/import/bookChannels'
import type { UsePasteOrFileImportOptions } from './usePasteOrFileImport'

/** The Import surface's single error line. Owned by `usePasteOrFileImport`. */
type ErrorSink = (message: string | null) => void

/** The one open door: a channel and the verdict it answered with. */
interface OpenBook {
  channel: ImportBookChannel
  filePath: string
  verdict: ImportBookVerdict
}

/** Everything the takeover surface renders — card included, chosen by channel. */
export interface ImportBookTakeover {
  channel: ImportBookChannel
  verdict: ImportBookVerdict
  busy: boolean
  onAdd: () => void
  onDismiss: () => void
}

export interface ImportBookIntake {
  /** Pick handlers to hand `usePasteOrFileImport`, one per registered channel. */
  pickOptions: Pick<UsePasteOrFileImportOptions, 'onWingletBook' | 'onEpubBook'>
  /**
   * The takeover for whatever door is open, or `null` for the ordinary import
   * surface. Takes the error sink because a failed commit and a failed submit
   * share one error line.
   */
  resolveTakeover: (setError: ErrorSink) => ImportBookTakeover | null
}

/**
 * Where a committed book lands: its own Contents view, which is the first place
 * the chapters are both visible and openable. Mirrors the segmented branch of
 * `handleImportSave`, and stays inside the context write rule (`refreshTexts` /
 * `openSegments` only).
 *
 * Takes the id the commit answered with — every channel hands one back, so the
 * landing path is format-blind (ADR-0033 amendment).
 */
export function useLandCommittedBook(): (textId: number) => Promise<void> {
  const libraryCtx = useContext(LibraryContext)
  const navCtx = useContext(NavigationContext)

  return async (textId) => {
    await libraryCtx?.refreshTexts()
    const record = (await window.api.db.getTexts()).find((candidate) => candidate.id === textId)
    if (record && libraryCtx?.openSegments) {
      await libraryCtx.openSegments(record)
      return
    }
    // The book is in the store either way; fall back to the list rather than
    // stranding the user on a card whose file has already been committed.
    navCtx?.setView('library')
  }
}

/** One pick handler per channel, keyed by the option the hook delivers it on. */
function buildPickOptions(
  channels: readonly ImportBookChannel[],
  onParsed: (open: OpenBook) => void
): Pick<UsePasteOrFileImportOptions, 'onWingletBook' | 'onEpubBook'> {
  const options: Pick<UsePasteOrFileImportOptions, 'onWingletBook' | 'onEpubBook'> = {}
  for (const channel of channels) {
    // Awaited by `openFile` inside its own try, so `busy` still covers the parse.
    options[channel.pickOption] = async ({ filePath }) => {
      onParsed({ channel, filePath, verdict: await channel.parse(filePath) })
    }
  }
  return options
}

interface CommitDeps {
  open: OpenBook
  committing: boolean
  setOpen: (open: OpenBook | null) => void
  setCommitting: (committing: boolean) => void
  setError: ErrorSink
  landBook: (textId: number) => Promise<void>
}

/**
 * Confirm: commit the open book, then either land it or show what the commit
 * answered instead. A refused commit replaces the verdict in place — the door
 * stays open on the same card slot — and a thrown IPC is the surface's error.
 *
 * One success check, no matter which door is open: every channel commits into
 * the same envelope, so anything that is not a `committed` answer is a verdict
 * the card can draw.
 */
async function commitOpenBook(deps: CommitDeps): Promise<void> {
  const { open, committing, setOpen, setCommitting, setError, landBook } = deps
  const { channel, filePath, verdict } = open
  if (!offersAdd(channel, verdict) || committing) return
  setError(null)
  setCommitting(true)

  let answer: Awaited<ReturnType<ImportBookChannel['commit']>>
  try {
    answer = await channel.commit(filePath)
  } catch (err) {
    setError(`Failed to add book: ${(err as Error).message}`)
    setCommitting(false)
    return
  }
  setCommitting(false)

  if (!isCommittedBook(answer)) {
    setOpen({ ...open, verdict: answer })
    return
  }
  setOpen(null)
  await landBook(answer.textId)
}

/**
 * The structured-book door of the Import surface (ADR-0033 §4, ADR-0034 §8).
 *
 * Holds the one open verdict and the shared commit lock, and resolves both to
 * the takeover the surface renders. Only one door can be open at a time: a pick
 * resolves to exactly one channel, and opening one replaces whatever was there.
 *
 * Nothing here knows a format. What the one card says and which commit call runs
 * are read off the channel — see {@link IMPORT_BOOK_CHANNELS} — and the landed
 * row is found by the id every commit answers with.
 */
export function useImportBookIntake(
  channels: readonly ImportBookChannel[] = IMPORT_BOOK_CHANNELS
): ImportBookIntake {
  const [open, setOpen] = useState<OpenBook | null>(null)
  const [committing, setCommitting] = useState(false)
  const landBook = useLandCommittedBook()

  // Stable across renders so the pick hook's `openFile` callback is stable too.
  const pickOptions = useMemo(() => buildPickOptions(channels, setOpen), [channels])

  const resolveTakeover = (setError: ErrorSink): ImportBookTakeover | null => {
    if (!open) return null
    return {
      channel: open.channel,
      verdict: open.verdict,
      busy: committing,
      onAdd: () => {
        void commitOpenBook({ open, committing, setOpen, setCommitting, setError, landBook })
      },
      /** Dismiss: drops the verdict and returns to the normal surface. Writes nothing. */
      onDismiss: () => {
        setError(null)
        setOpen(null)
      }
    }
  }

  return { pickOptions, resolveTakeover }
}
