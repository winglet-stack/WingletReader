/**
 * EP-3 — the EPUB parse-then-commit pair, driven through the real store.
 *
 * Mirrors `wingletBookImport.test.ts`: the parse cases assert that recognition
 * writes nothing (the confirm card is drawn before anything lands), and the
 * commit cases assert the other half of the same promise — the ladder is re-run
 * from disk, a book lands complete or not at all, and anything short of a valid
 * book leaves the library exactly as it was.
 *
 * Archives are built at test time from EP-2b's fixtures-as-code helpers
 * (ADR-0034 §9) — no binary fixture is checked in.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Database, UNCATEGORIZED_CATEGORY_ID } from '../database'
import {
  commitEpubImport,
  parseEpubImport,
  type EpubCommitResult,
  type EpubParseResult
} from '../epubImport'
import { EPUB_TEXT_BYTE_CAP } from '../../shared/epubBook'
import { bookEpub, makeEpub, opfXml, xhtmlDoc, type EpubSpec } from './epubFixtures'

let db: Database
let tmpDir: string
let fixtureCount = 0

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'wingletreader-epub-store-'))
  db = new Database(join(tmpDir, 'test-data.json'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

/** Writes a fixture under a unique name and hands back the path. */
async function fixture(spec: EpubSpec, fileName?: string): Promise<string> {
  fixtureCount += 1
  return makeEpub(tmpDir, fileName ?? `fixture-${fixtureCount}.epub`, spec)
}

const CHAPTERS = [
  { body: '<h1>The Wreck</h1><p>The lamp had not been lit.</p>' },
  { body: '<h1>The Flare</h1><p>A green flare cut the fog.</p>' },
  { body: '<h1>The Keeper</h1><p>He counted the seconds between waves.</p>' }
]

const NAV_ENTRIES = [
  { label: 'The Wreck', href: 'c1.xhtml' },
  { label: 'The Flare', href: 'c2.xhtml' },
  { label: 'The Keeper', href: 'c3.xhtml' }
]

/** The ordinary book every round-trip case uses: metadata, chapters, one image. */
function lighthouseSpec(): EpubSpec {
  return bookEpub({
    title: 'The Lighthouse Keeper',
    creator: 'A. Keeper',
    identifier: 'urn:uuid:8f1c',
    chapters: [
      { body: '<h1>The Wreck</h1><p><img src="plate.png" alt="A plate"/>The lamp had not been lit.</p>' },
      ...CHAPTERS.slice(1)
    ],
    nav: NAV_ENTRIES
  })
}

const LIGHTHOUSE_CONTENT =
  'The Wreck\n\nThe lamp had not been lit.\n\n' +
  'The Flare\n\nA green flare cut the fog.\n\n' +
  'The Keeper\n\nHe counted the seconds between waves.'

/** The store fingerprint every "writes nothing" case asserts is unchanged. */
function storeSnapshot(): string {
  return JSON.stringify({
    texts: db.getTexts().map((row) => db.getText(row.id!)),
    categories: db.getCategories()
  })
}

function expectAccepted(
  result: EpubParseResult
): Extract<EpubParseResult, { status: 'accepted' }> {
  if (result.status !== 'accepted') {
    throw new Error(`expected accepted, got ${JSON.stringify(result)}`)
  }
  return result
}

function expectCommitted(
  result: EpubCommitResult
): Extract<EpubCommitResult, { status: 'committed' }> {
  if (result.status !== 'committed') {
    throw new Error(`expected committed, got ${JSON.stringify(result)}`)
  }
  return result
}

const encryptionXml = (uris: string[]): string => `<?xml version="1.0" encoding="UTF-8"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"
            xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
${uris
  .map(
    (uri) => `  <enc:EncryptedData>
    <enc:CipherData><enc:CipherReference URI="${uri}"/></enc:CipherData>
  </enc:EncryptedData>`
  )
  .join('\n')}
</encryption>`

describe('parseEpubImport — the confirm card', () => {
  it('reports title, author, chapters, words, and omitted images without writing', async () => {
    const before = storeSnapshot()
    const filePath = await fixture(lighthouseSpec())

    const result = await parseEpubImport(db, filePath)

    expect(result).toEqual({
      status: 'accepted',
      filePath,
      confirmation: {
        title: 'The Lighthouse Keeper',
        author: 'A. Keeper',
        chapterCount: 3,
        wordCount: 24,
        imagesOmitted: 1
      }
    })
    expect(storeSnapshot()).toBe(before)
    expect(db.getTexts()).toEqual([])
  })

  it('reports a null author and zero images for a book that carries neither', async () => {
    const filePath = await fixture(bookEpub({ title: 'Plain', chapters: CHAPTERS, nav: NAV_ENTRIES }))

    const { confirmation } = expectAccepted(await parseEpubImport(db, filePath))

    expect(confirmation.author).toBeNull()
    expect(confirmation.imagesOmitted).toBe(0)
  })

  it('reports chapterCount 0 for a book the ladder left unsegmented', async () => {
    const filePath = await fixture(
      bookEpub({ title: 'One File', chapters: [{ body: '<p>One file, one story.</p>' }] })
    )

    const { confirmation } = expectAccepted(await parseEpubImport(db, filePath))

    expect(confirmation.chapterCount).toBe(0)
    expect(confirmation.wordCount).toBe(4)
  })
})

describe('parseEpubImport — refusals carry their own status', () => {
  it('names DRM rather than reporting damage', async () => {
    const filePath = await fixture({
      ...lighthouseSpec(),
      encryption: encryptionXml(['OEBPS/c1.xhtml'])
    })

    expect(await parseEpubImport(db, filePath)).toEqual({ status: 'drm-protected', filePath })
  })

  it('reports malformed with a diagnostic reason, and never throws on a bad path', async () => {
    const noContainer = await fixture({ ...lighthouseSpec(), container: null })

    expect(await parseEpubImport(db, noContainer)).toMatchObject({
      status: 'malformed',
      filePath: noContainer,
      reason: expect.stringContaining('container.xml')
    })
    await expect(parseEpubImport(db, join(tmpDir, 'absent.epub'))).resolves.toMatchObject({
      status: 'malformed'
    })
    await expect(parseEpubImport(db, tmpDir)).resolves.toMatchObject({ status: 'malformed' })
    await expect(parseEpubImport(db, undefined)).resolves.toEqual({
      status: 'malformed',
      filePath: '',
      reason: 'no file path'
    })
  })

  it('leaves the store untouched on every refusal', async () => {
    const before = storeSnapshot()

    await parseEpubImport(db, await fixture({ ...lighthouseSpec(), container: null }))
    await parseEpubImport(
      db,
      await fixture({ ...lighthouseSpec(), encryption: encryptionXml(['OEBPS/c1.xhtml']) })
    )
    await parseEpubImport(db, undefined)

    expect(storeSnapshot()).toBe(before)
  })
})

describe('the oversized refusal', () => {
  it('carries the cap it tripped through both halves of the pair', async () => {
    // One entry whose declared size alone blows the text budget; it is refused
    // without ever being decompressed (EP-2b), so the cost here is the fixture.
    const huge = 'lorem ipsum '.repeat(Math.ceil(EPUB_TEXT_BYTE_CAP / 12) + 100_000)
    expect(Buffer.byteLength(huge)).toBeGreaterThan(EPUB_TEXT_BYTE_CAP)
    const filePath = await fixture({
      opf: opfXml({
        title: 'Bomb',
        manifest: [{ id: 'c1', href: 'c1.xhtml' }],
        spine: [{ idref: 'c1' }]
      }),
      files: { 'OEBPS/c1.xhtml': xhtmlDoc(`<p>${huge}</p>`) }
    })

    const parsed = await parseEpubImport(db, filePath)
    expect(parsed).toMatchObject({
      status: 'oversized',
      filePath,
      cap: 'text',
      limitBytes: EPUB_TEXT_BYTE_CAP
    })

    expect(await commitEpubImport(db, filePath)).toMatchObject({ status: 'oversized' })
    expect(db.getTexts()).toEqual([])
  }, 120_000)
})

describe('commitEpubImport — the book lands complete', () => {
  it('inserts the text record with its EPUB evidence and returns the new id', async () => {
    const filePath = await fixture(lighthouseSpec())

    const result = await commitEpubImport(db, filePath)

    const { textId } = expectCommitted(result)
    expect(result).toEqual({ status: 'committed', filePath, textId })

    const text = db.getText(textId)!
    expect(text.title).toBe('The Lighthouse Keeper')
    expect(text.author).toBe('A. Keeper')
    expect(text.source_type).toBe('epub')
    expect(text.content).toBe(LIGHTHOUSE_CONTENT)
    // Structure comes from markup, so the two renditions are the same string.
    expect(text.content_display).toBe(text.content)
    expect(text.word_count).toBe(24)
    // Not a curated Winglet Book, and not a manual book (ADR-0034 §2).
    expect(text.seed_id).toBeUndefined()
    expect(text.is_manual_book).toBeFalsy()
    // Lands in Uncategorized — the card offers no category picker (§8).
    expect(text.category_id).toBe(UNCATEGORIZED_CATEGORY_ID)

    expect(text.import_diagnostics).toMatchObject({
      parser: 'epub',
      sourceExtension: 'epub',
      epubIdentifier: 'urn:uuid:8f1c',
      imagesOmitted: 1,
      wordCount: 24
    })
  })

  it('derives order, counts, and contiguous offsets for every chapter', async () => {
    const { textId } = expectCommitted(await commitEpubImport(db, await fixture(lighthouseSpec())))

    const segments = db.getSegments(textId)

    expect(segments.map((s) => s.title)).toEqual(['The Wreck', 'The Flare', 'The Keeper'])
    expect(segments.map((s) => s.order)).toEqual([0, 1, 2])
    expect(segments.every((s) => s.sourceType === 'detected_heading')).toBe(true)
    expect(segments.map((s) => [s.startWordOffset, s.endWordOffset])).toEqual([
      [0, 8],
      [8, 16],
      [16, 24]
    ])
    // Chapters join back to the book, and the last offset is the book's own
    // word count — bookmarks and chapter-nav cannot drift.
    expect(segments.map((s) => s.content).join('\n\n')).toBe(db.getText(textId)!.content)
    expect(segments[2].endWordOffset).toBe(db.getText(textId)!.word_count)
    expect(db.getTexts()[0].segment_count).toBe(3)
  })

  it('omits the author field entirely when the publisher gave no dc:creator', async () => {
    const { textId } = expectCommitted(
      await commitEpubImport(
        db,
        await fixture(bookEpub({ title: 'Anonymous', chapters: CHAPTERS, nav: NAV_ENTRIES }))
      )
    )

    expect(db.getText(textId)!.author).toBeUndefined()
    expect(db.getText(textId)!.import_diagnostics?.epubIdentifier).toBeUndefined()
  })

  it('inserts the text row only for a book the ladder left unsegmented', async () => {
    const filePath = await fixture(
      bookEpub({ title: 'One File', chapters: [{ body: '<h1>All Of It</h1><p>One story.</p>' }] })
    )

    const { textId } = expectCommitted(await commitEpubImport(db, filePath))

    expect(db.getSegments(textId)).toEqual([])
    expect(db.getText(textId)!.content).toBe('All Of It\n\nOne story.')
    expect(db.getTexts()[0].segment_count).toBeUndefined()
  })
})

describe('commitEpubImport — no dedupe on identifier (ADR-0034 §7)', () => {
  it('creates a second text when the same EPUB is imported again', async () => {
    const filePath = await fixture(lighthouseSpec())

    const first = expectCommitted(await commitEpubImport(db, filePath))
    const second = expectCommitted(await commitEpubImport(db, filePath))

    expect(second.textId).not.toBe(first.textId)
    expect(db.getTexts()).toHaveLength(2)
    for (const row of db.getTexts()) {
      expect(db.getText(row.id!)!.import_diagnostics?.epubIdentifier).toBe('urn:uuid:8f1c')
      expect(db.getSegments(row.id!)).toHaveLength(3)
    }
  })
})

describe('commitEpubImport — nothing half-lands', () => {
  it('rolls the text back when the segment write fails', async () => {
    const filePath = await fixture(lighthouseSpec())
    const failing = db as unknown as { saveSegments: () => never }
    failing.saveSegments = () => {
      throw new Error('segment write failed')
    }

    const result = await commitEpubImport(db, filePath)

    expect(result).toMatchObject({
      status: 'malformed',
      reason: expect.stringContaining('segment write failed')
    })
    // The text row is gone with it: a chapterless book is worse than no book.
    expect(db.getTexts()).toEqual([])
  })

  it('re-runs the ladder from disk, refusing a file that went bad after the parse', async () => {
    const filePath = await fixture(lighthouseSpec(), 'swapped.epub')
    expect(await parseEpubImport(db, filePath)).toMatchObject({ status: 'accepted' })

    // The same path, now holding a protected book.
    await fixture(
      { ...lighthouseSpec(), encryption: encryptionXml(['OEBPS/c1.xhtml']) },
      'swapped.epub'
    )

    expect(await commitEpubImport(db, filePath)).toEqual({ status: 'drm-protected', filePath })
    expect(db.getTexts()).toEqual([])
  })

  it('writes nothing for a protected, damaged, or unusable file', async () => {
    const before = storeSnapshot()

    const refusals = [
      await commitEpubImport(
        db,
        await fixture({ ...lighthouseSpec(), encryption: encryptionXml(['OEBPS/c1.xhtml']) })
      ),
      await commitEpubImport(db, await fixture({ ...lighthouseSpec(), container: null })),
      await commitEpubImport(
        db,
        await fixture(bookEpub({ chapters: [{ body: '<p><img src="only-a-picture.png"/></p>' }] }))
      ),
      await commitEpubImport(db, join(tmpDir, 'absent.epub')),
      await commitEpubImport(db, undefined)
    ]

    expect(refusals.map((r) => r.status)).toEqual([
      'drm-protected',
      'malformed',
      'malformed',
      'malformed',
      'malformed'
    ])
    expect(storeSnapshot()).toBe(before)
    // Not even a category is created on the way to a refusal.
    expect(db.getCategories()).toEqual(JSON.parse(before).categories)
  })
})
