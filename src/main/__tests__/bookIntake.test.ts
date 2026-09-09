/**
 * Book intake — driven by a **fake third format** (`architecture-depth/05`).
 *
 * This suite is the acceptance evidence for the seam. Not one case here touches
 * `.wbook` or `.epub`: the format below is invented, its refusal vocabulary is
 * invented, and the fields it puts on the text row are invented — yet parse,
 * commit, re-validation, insertion, rollback and totality all work, with **no
 * edit to `bookIntake.ts`**. If adding a format ever required one, these tests
 * would need it too, and they do not.
 *
 * The adapter is deliberately trivial (a title line, then chapters separated by
 * a `---` rule) so that what is being tested is the ladder around it, not the
 * format in it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Database } from '../database'
import {
  createBookIntake,
  type BookIntakeAdapter,
  type IntakeBook,
  type IntakeOutcome
} from '../bookIntake'
import { countWords } from '../../shared/importTextCleanup'

let db: Database
let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'wingletreader-book-intake-'))
  db = new Database(join(tmpDir, 'test-data.json'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── The invented format ──────────────────────────────────────────────────────

/** What this format's confirm card would show. Nothing else in the tree knows it. */
interface RuledConfirmation {
  title: string
  chapterCount: number
  ruleCount: number
}

/** Its refusal vocabulary — deliberately unlike either shipped format's. */
type RuledRefusal =
  | { status: 'not-ruled'; filePath: string }
  | { status: 'too-short'; filePath: string; chapters: number }
  | { status: 'broken'; filePath: string; reason: string }

/** The chapter separator that gives the format its name. */
const RULE = '\n---\n'

/**
 * The format's own derivation: order, counts and contiguous offsets from the
 * same frozen word counter both shipped formats use. Chapters are *resolved by
 * the file*, never re-detected — the rules are already in the bytes.
 */
function derive(title: string, chapters: string[]): IntakeBook {
  let offset = 0
  const segments = chapters.map((content, index) => {
    const word_count = countWords(content)
    const segment = {
      title: `Chapter ${index + 1}`,
      content,
      order: index,
      word_count,
      startWordOffset: offset,
      endWordOffset: offset + word_count
    }
    offset += word_count
    return segment
  })
  return { title, content: chapters.join('\n\n'), segments }
}

/**
 * A whole format in one object. Note what it never mentions: totality, the
 * insert, the rollback, the success envelope, or the other two formats.
 */
const ruledAdapter: BookIntakeAdapter<RuledConfirmation, RuledRefusal> = {
  format: 'ruled-book',

  refuse: (filePath, reason) => ({ status: 'broken', filePath, reason }),

  derive: async (
    store,
    filePath
  ): Promise<IntakeOutcome<RuledConfirmation, RuledRefusal>> => {
    const raw = readRuledFile(filePath)
    if (raw === null) {
      return {
        accepted: false,
        refusal: { status: 'broken', filePath, reason: 'file could not be read' }
      }
    }

    const [titleLine, ...rest] = raw.split('\n')
    if (!titleLine.startsWith('# ')) {
      return { accepted: false, refusal: { status: 'not-ruled', filePath } }
    }

    const chapters = rest
      .join('\n')
      .trim()
      .split(RULE)
      .map((part) => part.trim())
      .filter((part) => part !== '')
    if (chapters.length < 2) {
      return {
        accepted: false,
        refusal: { status: 'too-short', filePath, chapters: chapters.length }
      }
    }

    const title = titleLine.slice(2).trim()
    return {
      accepted: true,
      confirmation: { title, chapterCount: chapters.length, ruleCount: chapters.length - 1 },
      prepare: () => ({
        book: derive(title, chapters),
        // Format-supplied row data, not a branch inside the intake: this format
        // marks its books as manual and stamps a category it creates by name.
        fields: {
          is_manual_book: true,
          category_id: store.saveCategory({ name: 'Ruled Books' }).id
        }
      })
    }
  }
}

function readRuledFile(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

const ruledIntake = createBookIntake(ruledAdapter)

/** Writes a ruled book and returns its path. */
function writeRuled(name: string, title: string, chapters: string[]): string {
  const filePath = join(tmpDir, name)
  writeFileSync(filePath, `# ${title}\n${chapters.join(RULE)}`, 'utf-8')
  return filePath
}

const CHAPTERS = ['The lamp had not been lit.', 'A green flare cut the fog.']

// ── The intake, exercised entirely through the invented format ───────────────

describe('book intake — parse', () => {
  it('reports the adapter’s own confirmation and writes nothing', async () => {
    const filePath = writeRuled('book.ruled', 'The Lighthouse Keeper', CHAPTERS)

    expect(await ruledIntake.parse(db, filePath)).toEqual({
      status: 'accepted',
      filePath,
      confirmation: { title: 'The Lighthouse Keeper', chapterCount: 2, ruleCount: 1 }
    })
    expect(db.getTexts()).toEqual([])
    // Not even the category the adapter's `prepare` would create: parse never
    // reaches it, which is what lets `.wbook` merge a category on commit only.
    expect(db.getCategories().map((c) => c.name)).not.toContain('Ruled Books')
  })

  it('hands back the adapter’s refusals verbatim, in the adapter’s own words', async () => {
    const notRuled = join(tmpDir, 'plain.ruled')
    writeFileSync(notRuled, 'Once upon a time.', 'utf-8')

    expect(await ruledIntake.parse(db, notRuled)).toEqual({ status: 'not-ruled', filePath: notRuled })
    expect(await ruledIntake.parse(db, writeRuled('one.ruled', 'Short', ['Only one.']))).toEqual({
      status: 'too-short',
      filePath: join(tmpDir, 'one.ruled'),
      chapters: 1
    })
    expect(db.getTexts()).toEqual([])
  })
})

describe('book intake — commit', () => {
  it('lands the book with derived order, counts and contiguous offsets', async () => {
    const filePath = writeRuled('book.ruled', 'The Lighthouse Keeper', CHAPTERS)

    const result = await ruledIntake.commit(db, filePath)

    const rows = db.getTexts()
    expect(rows).toHaveLength(1)
    // The shared success envelope — the same one both shipped formats answer.
    expect(result).toEqual({ status: 'committed', filePath, textId: rows[0].id })

    const text = db.getText(rows[0].id!)!
    expect(text.title).toBe('The Lighthouse Keeper')
    expect(text.content).toBe('The lamp had not been lit.\n\nA green flare cut the fog.')
    expect(text.word_count).toBe(12)

    const segments = db.getSegments(rows[0].id!)
    expect(segments.map((s) => s.title)).toEqual(['Chapter 1', 'Chapter 2'])
    expect(segments.map((s) => s.order)).toEqual([0, 1])
    // The intake stamps every format's chapters the same way: resolved upstream,
    // never re-detected, so they behave as headings rather than chunks.
    expect(segments.every((s) => s.sourceType === 'detected_heading')).toBe(true)
    expect(segments.map((s) => [s.startWordOffset, s.endWordOffset])).toEqual([
      [0, 6],
      [6, 12]
    ])
    expect(segments[1].endWordOffset).toBe(text.word_count)
  })

  it('writes the row fields the adapter supplied, which the intake never names', async () => {
    await ruledIntake.commit(db, writeRuled('book.ruled', 'Ruled', CHAPTERS))

    const text = db.getText(db.getTexts()[0].id!)!
    expect(text.is_manual_book).toBe(true)
    expect(db.getCategories().find((c) => c.id === text.category_id)?.name).toBe('Ruled Books')
    // Nothing leaked in from the shipped formats.
    expect(text.seed_id).toBeUndefined()
    expect(text.source_type).toBeUndefined()
  })

  it('inserts the text row alone when the adapter derives no segments', async () => {
    const unsegmented: BookIntakeAdapter<RuledConfirmation, RuledRefusal> = {
      ...ruledAdapter,
      derive: async () => ({
        accepted: true,
        confirmation: { title: 'Flat', chapterCount: 0, ruleCount: 0 },
        prepare: () => ({ book: { title: 'Flat', content: 'One story.', segments: [] }, fields: {} })
      })
    }

    const result = await createBookIntake(unsegmented).commit(db, writeRuled('f.ruled', 'Flat', CHAPTERS))

    expect(result).toMatchObject({ status: 'committed' })
    expect(db.getSegments(db.getTexts()[0].id!)).toEqual([])
    expect(db.getText(db.getTexts()[0].id!)!.content).toBe('One story.')
  })

  it('leaves the store exactly as it was on every refusal', async () => {
    const before = JSON.stringify({ texts: db.getTexts(), categories: db.getCategories() })

    const refusals = [
      await ruledIntake.commit(db, writeRuled('one.ruled', 'Short', ['Only one.'])),
      await ruledIntake.commit(db, join(tmpDir, 'absent.ruled')),
      await ruledIntake.commit(db, undefined)
    ]

    expect(refusals.map((r) => r.status)).toEqual(['too-short', 'broken', 'broken'])
    expect(JSON.stringify({ texts: db.getTexts(), categories: db.getCategories() })).toBe(before)
  })
})

describe('book intake — the pair is stateless', () => {
  it('re-runs the ladder from disk, refusing a file that went bad after the parse', async () => {
    const filePath = writeRuled('book.ruled', 'The Lighthouse Keeper', CHAPTERS)
    expect((await ruledIntake.parse(db, filePath)).status).toBe('accepted')

    writeFileSync(filePath, 'no longer a ruled book', 'utf-8')

    expect(await ruledIntake.commit(db, filePath)).toEqual({ status: 'not-ruled', filePath })
    expect(db.getTexts()).toEqual([])
  })

  it('refuses a file that disappeared after the parse', async () => {
    const filePath = writeRuled('book.ruled', 'Gone', CHAPTERS)
    expect((await ruledIntake.parse(db, filePath)).status).toBe('accepted')
    unlinkSync(filePath)

    expect(await ruledIntake.commit(db, filePath)).toMatchObject({
      status: 'broken',
      reason: 'file could not be read'
    })
    expect(db.getTexts()).toEqual([])
  })
})

describe('book intake — nothing half-lands', () => {
  it('rolls the text back when the segment write fails', async () => {
    const filePath = writeRuled('book.ruled', 'The Lighthouse Keeper', CHAPTERS)
    const failing = db as unknown as { saveSegments: () => never }
    failing.saveSegments = () => {
      throw new Error('segment write failed')
    }

    const result = await ruledIntake.commit(db, filePath)

    // The store failure comes back in the adapter's catch-all word, not the
    // intake's — the refusal vocabulary is the format's, all the way down.
    expect(result).toEqual({
      status: 'broken',
      filePath,
      reason: 'could not be saved: segment write failed'
    })
    // The text row is gone with it: a chapterless book is worse than no book.
    expect(db.getTexts()).toEqual([])
  })
})

describe('book intake — totality', () => {
  it('answers a non-string path in the adapter’s words, without throwing', async () => {
    for (const path of [undefined, null, 42, {}]) {
      expect(await ruledIntake.parse(db, path)).toEqual({
        status: 'broken',
        filePath: '',
        reason: 'no file path'
      })
      expect(await ruledIntake.commit(db, path)).toEqual({
        status: 'broken',
        filePath: '',
        reason: 'no file path'
      })
    }
    expect(db.getTexts()).toEqual([])
  })

  it('turns an adapter that throws into that adapter’s refusal', async () => {
    const exploding: BookIntakeAdapter<RuledConfirmation, RuledRefusal> = {
      ...ruledAdapter,
      derive: async () => {
        throw new Error('the ladder fell over')
      }
    }
    const filePath = writeRuled('book.ruled', 'Boom', CHAPTERS)

    expect(await createBookIntake(exploding).parse(db, filePath)).toEqual({
      status: 'broken',
      filePath,
      reason: 'unexpected failure: the ladder fell over'
    })
    expect(db.getTexts()).toEqual([])
  })
})
