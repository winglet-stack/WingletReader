/**
 * Stats store collection (ADR-0035 §4–§5) — the day lifecycle the main process
 * owns: record → fold → prune → live-today recompute, plus the derived reads.
 *
 * Every test drives a fake clock through local-time `Date` construction (never
 * a UTC string), because the whole model keys on **local** calendar dates.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Database } from '../database'
import type { DayStatsRecord, SessionStatsRecord } from '../database'
import { deriveStreak, localDateKey, pointsForDay } from '../../shared/statsMath'
import { flattenSettingsStore, settingsStoreFromFlat } from '../../shared/settings'

let tmpDir: string
let storePath: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'fasttrack-stats-'))
  storePath = join(tmpDir, 'test-data.json')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── Helpers ────────────────────────────────────────────────────────────────

/** Local wall-clock instant — the store's day keys are local dates. */
function at(year: number, month: number, day: number, hour = 10, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime()
}

function setNow(epochMs: number): void {
  vi.setSystemTime(new Date(epochMs))
}

function session(overrides: Partial<SessionStatsRecord> & { startedAt: number }): SessionStatsRecord {
  return {
    textId: 1,
    title: 'A Text',
    endedAt: overrides.startedAt + 600_000,
    activeMs: 540_000,
    wordsRead: 600,
    pauses: 2,
    rewinds: 1,
    ...overrides
  }
}

/** A store file written without `stats` — i.e. every store from before ADR-0035. */
function writeLegacyStore(overrides: Record<string, unknown> = {}): void {
  writeFileSync(
    storePath,
    JSON.stringify(
      {
        nextId: 1,
        nextCategoryId: 4,
        nextSegmentId: 1,
        nextBookmarkId: 1,
        nextSummaryId: 1,
        nextSummaryQuestionId: 1,
        texts: [],
        categories: [],
        segments: [],
        bookmarks: [],
        summaries: [],
        summaryQuestions: [],
        readingPositions: [],
        settings: {},
        seededIds: [],
        seededBundleVersion: 0,
        ...overrides
      },
      null,
      2
    ),
    'utf-8'
  )
}

function readStoredStats(): { days: DayStatsRecord[]; sessions: SessionStatsRecord[] } {
  return JSON.parse(readFileSync(storePath, 'utf-8')).stats
}

function dayRecord(overrides: Partial<DayStatsRecord> & { date: string }): DayStatsRecord {
  return {
    wordsRead: 1200,
    wallMs: 1_200_000,
    activeMs: 1_080_000,
    pauses: 4,
    rewinds: 2,
    sessionCount: 2,
    longestSessionMs: 600_000,
    bestSessionFluency: 85,
    quotaTargetWords: 1000,
    weeklyTargetDays: 5,
    quotaMet: true,
    points: 100,
    ...overrides
  }
}

// ── Load compatibility ─────────────────────────────────────────────────────

describe('stats store defaults and round-trip', () => {
  it('loads a pre-ADR-0035 store with stats defaulted', () => {
    writeLegacyStore()

    const db = new Database(storePath)

    expect(db.getStatsDays()).toEqual([])
    expect(db.getTodaySessionStats()).toEqual([])
    // The empty collection is only materialised on the next write, so no read
    // rewrites a legacy file for nothing.
    db.saveText({ title: 'Anything', content: 'one two' })
    expect(readStoredStats()).toEqual({ days: [], sessions: [] })
  })

  it('round-trips a stored stats collection unchanged', () => {
    vi.useFakeTimers()
    setNow(at(2026, 8, 12))
    const stats = {
      days: [dayRecord({ date: '2026-08-10' }), dayRecord({ date: '2026-08-11', points: 110 })],
      sessions: [session({ startedAt: at(2026, 8, 12, 9) })]
    }
    writeLegacyStore({ stats })

    const db = new Database(storePath)
    db.saveText({ title: 'Unrelated write', content: 'one two' })

    expect(readStoredStats().days).toEqual(stats.days)
    expect(db.getTodaySessionStats()).toEqual(stats.sessions)
  })

  it('drops malformed stats entries instead of failing the load', () => {
    writeLegacyStore({
      stats: {
        days: [null, { date: 'not-a-date' }, dayRecord({ date: '2026-08-11' })],
        sessions: ['nope', { title: 'no start instant' }]
      }
    })

    const db = new Database(storePath)

    expect(db.getStatsDays().map((day) => day.date)).toEqual(['2026-08-11'])
    expect(db.getTodaySessionStats()).toEqual([])
  })
})

// ── Recording, folding, pruning ────────────────────────────────────────────

describe('recordSessionStats', () => {
  it('folds closed days into day records and prunes their sessions', () => {
    vi.useFakeTimers()
    const db = new Database(storePath)

    setNow(at(2026, 8, 10, 9))
    db.recordSessionStats(session({ startedAt: at(2026, 8, 10, 9), wordsRead: 400 }))
    setNow(at(2026, 8, 10, 20))
    db.recordSessionStats(session({ startedAt: at(2026, 8, 10, 20), wordsRead: 700 }))

    // Both sessions are still live while the day is open.
    expect(db.getTodaySessionStats()).toHaveLength(2)

    setNow(at(2026, 8, 11, 8))
    db.recordSessionStats(session({ startedAt: at(2026, 8, 11, 8), wordsRead: 300 }))

    const days = db.getStatsDays()
    expect(days.map((day) => day.date)).toEqual(['2026-08-10', '2026-08-11'])
    expect(days[0]).toMatchObject({
      wordsRead: 1100,
      sessionCount: 2,
      quotaTargetWords: 1000,
      quotaMet: true
    })
    expect(days[1]).toMatchObject({ wordsRead: 300, sessionCount: 1, quotaMet: false })

    const sessions = db.getTodaySessionStats()
    expect(sessions).toHaveLength(1)
    expect(localDateKey(sessions[0].startedAt)).toBe('2026-08-11')
    expect(readStoredStats().sessions).toHaveLength(1)
  })

  it('writes the store exactly once per recorded session', () => {
    vi.useFakeTimers()
    setNow(at(2026, 8, 12))
    const db = new Database(storePath)
    const writes = vi.spyOn(fs, 'writeFileSync')

    db.recordSessionStats(session({ startedAt: at(2026, 8, 12, 9) }))

    expect(writes).toHaveBeenCalledTimes(1)
  })

  it('ignores a session that advanced no words', () => {
    vi.useFakeTimers()
    setNow(at(2026, 8, 12))
    const db = new Database(storePath)

    db.recordSessionStats(session({ startedAt: at(2026, 8, 12, 9), wordsRead: 0 }))

    expect(db.getTodaySessionStats()).toEqual([])
    expect(db.getStatsDays()).toEqual([])
  })

  it('clamps a session whose clock ran backwards rather than subtracting', () => {
    vi.useFakeTimers()
    setNow(at(2026, 8, 12))
    const db = new Database(storePath)

    db.recordSessionStats(
      session({
        startedAt: at(2026, 8, 12, 9),
        endedAt: at(2026, 8, 12, 8),
        activeMs: -1000,
        wordsRead: 500
      })
    )

    expect(db.getStatsDays()[0]).toMatchObject({ wallMs: 0, activeMs: 0, wordsRead: 500 })
  })

  it('merges a session for an already-folded day into that frozen record', () => {
    vi.useFakeTimers()
    const db = new Database(storePath)

    setNow(at(2026, 8, 10, 22))
    db.recordSessionStats(session({ startedAt: at(2026, 8, 10, 22), wordsRead: 400 }))

    // A read after midnight closes the 10th and prunes its session…
    setNow(at(2026, 8, 11, 0, 2))
    expect(db.getStatsDays()[0].wordsRead).toBe(400)
    expect(db.getTodaySessionStats()).toEqual([])

    // …and a run that started before midnight still lands on the 10th.
    db.recordSessionStats(session({ startedAt: at(2026, 8, 10, 23, 50), wordsRead: 250 }))

    const days = db.getStatsDays()
    expect(days).toHaveLength(1)
    expect(days[0]).toMatchObject({ date: '2026-08-10', wordsRead: 650, sessionCount: 2 })
    expect(db.getTodaySessionStats()).toEqual([])
  })
})

// ── Active time as the scored currency (ADR-0036 §4) ───────────────────────

describe('active time is what the fold scores', () => {
  it('raises longestSessionMs by a session’s active time, not its span', () => {
    vi.useFakeTimers()
    setNow(at(2026, 8, 12, 12))
    const db = new Database(storePath)

    // Lunch with the Reader open: a two-hour span, four minutes of reading.
    db.recordSessionStats(
      session({
        startedAt: at(2026, 8, 12, 12),
        endedAt: at(2026, 8, 12, 14),
        activeMs: 240_000,
        wordsRead: 400
      })
    )

    const [today] = db.getStatsDays()
    expect(today.longestSessionMs).toBe(240_000)
    // The span is still recorded — descriptive, and it scores nothing.
    expect(today.wallMs).toBe(7_200_000)
    expect(db.getStatsOverview().highscores.longestSessionMs).toBe(240_000)
  })

  it('reports today’s active time beside the span the Reader was open', () => {
    vi.useFakeTimers()
    setNow(at(2026, 8, 12, 9))
    const db = new Database(storePath)

    db.recordSessionStats(
      session({
        startedAt: at(2026, 8, 12, 9),
        endedAt: at(2026, 8, 12, 10),
        activeMs: 900_000,
        wordsRead: 800
      })
    )

    // The banner reads `activeMs`; `wallMs` rides along for export only.
    expect(db.getStatsOverview().today).toMatchObject({
      activeMs: 900_000,
      wallMs: 3_600_000
    })
  })

  it('leaves a pre-guard day’s wall-based longestSessionMs as recorded (§8)', () => {
    vi.useFakeTimers()
    setNow(at(2026, 8, 12, 9))
    // A day folded before the guards: its longest session was measured in wall
    // time. Closed days are never recomputed, so it stands as history — and the
    // highscore max simply mixes it with the new active-time values.
    const historical = dayRecord({ date: '2026-08-10', longestSessionMs: 1_200_000 })
    writeLegacyStore({ stats: { days: [historical], sessions: [] } })
    const db = new Database(storePath)

    db.recordSessionStats(
      session({
        startedAt: at(2026, 8, 12, 9),
        endedAt: at(2026, 8, 12, 11),
        activeMs: 300_000,
        wordsRead: 500
      })
    )

    expect(db.getStatsDays().find((day) => day.date === '2026-08-10')).toEqual(historical)
    expect(db.getStatsOverview().highscores.longestSessionMs).toBe(1_200_000)
  })
})

// ── Live today vs frozen history ───────────────────────────────────────────

describe('live today recompute', () => {
  it('pins today at the first session and applies a changed quota tomorrow', () => {
    vi.useFakeTimers()
    const db = new Database(storePath)

    setNow(at(2026, 8, 11, 9))
    db.recordSessionStats(session({ startedAt: at(2026, 8, 11, 9), wordsRead: 600 }))
    expect(db.getStatsDays()[0]).toMatchObject({
      quotaTargetWords: 1000,
      quotaMet: false,
      points: 0
    })

    db.saveSettings({ daily_word_quota: 500 })
    setNow(at(2026, 8, 11, 14))
    db.recordSessionStats(session({ startedAt: at(2026, 8, 11, 14), wordsRead: 100 }))

    // Seven hundred words are past the new 500-word setting, but today's
    // original target/verdict/points remain pinned.
    expect(db.getStatsDays()[0]).toMatchObject({
      date: '2026-08-11',
      quotaTargetWords: 1000,
      quotaMet: false,
      points: 0
    })

    setNow(at(2026, 8, 12, 9))
    db.recordSessionStats(session({ startedAt: at(2026, 8, 12, 9), wordsRead: 500 }))
    expect(db.getStatsDays()[1]).toMatchObject({
      date: '2026-08-12',
      quotaTargetWords: 500,
      quotaMet: true,
      points: pointsForDay(1)
    })
  })

  it('applies quota edits immediately before the first session of the day', () => {
    vi.useFakeTimers()
    setNow(at(2026, 8, 11, 8))
    const db = new Database(storePath)

    db.saveSettings({ daily_word_quota: 2000 })
    expect(db.getStatsOverview().goals.dailyPinned).toBe(false)

    db.recordSessionStats(session({ startedAt: at(2026, 8, 11, 9), wordsRead: 1200 }))
    expect(db.getStatsDays()[0]).toMatchObject({
      quotaTargetWords: 2000,
      quotaMet: false,
      points: 0
    })
    expect(db.getStatsOverview().goals.dailyPinned).toBe(true)
  })

  it('defers a raised quota symmetrically once today is pinned', () => {
    vi.useFakeTimers()
    setNow(at(2026, 8, 11, 9))
    const db = new Database(storePath)

    db.recordSessionStats(session({ startedAt: at(2026, 8, 11, 9), wordsRead: 1200 }))
    const awarded = db.getStatsDays()[0].points
    db.saveSettings({ daily_word_quota: 5000 })

    expect(db.getStatsDays()[0]).toMatchObject({
      quotaTargetWords: 1000,
      quotaMet: true,
      points: awarded
    })
  })

  it('freezes the day against the snapshot it was live under, not today’s settings', () => {
    vi.useFakeTimers()
    const db = new Database(storePath)

    setNow(at(2026, 8, 10, 9))
    db.recordSessionStats(session({ startedAt: at(2026, 8, 10, 9), wordsRead: 1200 }))
    expect(db.getStatsDays()[0]).toMatchObject({ quotaMet: true, points: pointsForDay(1) })

    // Raising the quota the next day must not retroactively unmeet the 10th.
    db.saveSettings({ daily_word_quota: 5000 })
    setNow(at(2026, 8, 11, 9))

    expect(db.getStatsDays()[0]).toMatchObject({
      date: '2026-08-10',
      quotaTargetWords: 1000,
      quotaMet: true,
      points: pointsForDay(1)
    })
  })
  it('never re-derives a closed day verdict or points against later settings', () => {
    vi.useFakeTimers()
    setNow(at(2026, 8, 10, 9))
    const db = new Database(storePath)
    db.recordSessionStats(session({ startedAt: at(2026, 8, 10, 9), wordsRead: 1200 }))

    setNow(at(2026, 8, 11, 8))
    db.getStatsOverview()
    const closed = db.getStatsDays()[0]

    db.saveSettings({ daily_word_quota: 10_000, weekly_quota_days: 1 })
    db.recordSessionStats(session({ startedAt: at(2026, 8, 11, 9), wordsRead: 600 }))

    expect(db.getStatsDays()[0]).toEqual(closed)
  })
})

describe('weekly goal pin', () => {
  it('keeps a mid-week edit out of this week and applies it next Monday', () => {
    vi.useFakeTimers()
    setNow(at(2026, 8, 3, 8)) // Monday
    const db = new Database(storePath)
    db.saveSettings({ weekly_quota_days: 7 })
    db.recordSessionStats(session({ startedAt: at(2026, 8, 3, 9), wordsRead: 1200 }))

    // Tuesday is missed. Wednesday's met day starts a new run under the pinned
    // zero-rest-day budget, so Monday cannot be resurrected by a looser edit.
    setNow(at(2026, 8, 5, 9))
    db.recordSessionStats(session({ startedAt: at(2026, 8, 5, 9), wordsRead: 1200 }))
    expect(db.getStatsOverview().streak).toBe(1)

    db.saveSettings({ weekly_quota_days: 5 })
    setNow(at(2026, 8, 6, 9))
    db.recordSessionStats(session({ startedAt: at(2026, 8, 6, 9), wordsRead: 1200 }))

    const thisWeek = db.getStatsDays().filter((day) => day.date < '2026-08-10')
    expect(thisWeek.map((day) => day.weeklyTargetDays)).toEqual([7, 7, 7])
    expect(db.getStatsOverview()).toMatchObject({
      streak: 2,
      goals: { weeklyPinned: true, weeklyTargetDays: 7 }
    })

    setNow(at(2026, 8, 10, 8)) // next Monday, before reading
    expect(db.getStatsOverview().goals).toMatchObject({
      dailyPinned: false,
      weeklyPinned: false,
      weeklyTargetDays: 5
    })
    db.recordSessionStats(session({ startedAt: at(2026, 8, 10, 9), wordsRead: 1200 }))
    expect(db.getStatsDays().at(-1)).toMatchObject({ weeklyTargetDays: 5 })
    expect(db.getStatsOverview().goals.weeklyPinned).toBe(true)
  })
})

// ── Derived reads ──────────────────────────────────────────────────────────

describe('getStatsOverview', () => {
  /** Three full weeks: quota met Mon–Fri, missed on the weekend (budget 2). */
  function seededDays(): DayStatsRecord[] {
    const days: DayStatsRecord[] = []
    for (let offset = 0; offset < 21; offset += 1) {
      const date = new Date(2026, 6, 20 + offset)
      const isWeekend = date.getDay() === 0 || date.getDay() === 6
      if (isWeekend) continue
      days.push(
        dayRecord({
          date: localDateKey(date.getTime()),
          wordsRead: 1200 + offset,
          points: 0,
          quotaMet: true
        })
      )
    }
    // Points as the store awards them: the streak including that day.
    return days.map((day, index) => ({ ...day, points: pointsForDay(index + 1) }))
  }

  it('matches statsMath for streak and sums points across the history', () => {
    vi.useFakeTimers()
    const days = seededDays()
    const todayKey = '2026-08-10'
    setNow(at(2026, 8, 10, 9))
    writeLegacyStore({ stats: { days, sessions: [] } })

    const overview = new Database(storePath).getStatsOverview()

    expect(overview.streak).toBe(deriveStreak(days, todayKey))
    expect(overview.streak).toBe(15)
    expect(overview.points).toBe(days.reduce((sum, day) => sum + day.points, 0))
    expect(overview.totals).toMatchObject({
      activeDays: days.length,
      wordsRead: days.reduce((sum, day) => sum + day.wordsRead, 0),
      sessionCount: days.length * 2
    })
    expect(overview.highscores).toMatchObject({
      bestDayWords: Math.max(...days.map((day) => day.wordsRead)),
      bestSessionFluency: 85,
      longestSessionMs: 600_000,
      longestStreak: 15
    })
  })

  it('reports today from the live record and zeroes an unread day', () => {
    vi.useFakeTimers()
    setNow(at(2026, 8, 12, 9))
    const db = new Database(storePath)

    const idle = db.getStatsOverview()
    expect(idle.today).toMatchObject({
      date: '2026-08-12',
      wordsRead: 0,
      sessionCount: 0,
      quotaTargetWords: 1000,
      quotaPercent: 0,
      quotaMet: false,
      points: 0
    })

    db.recordSessionStats(
      session({ startedAt: at(2026, 8, 12, 9), wordsRead: 500, pauses: 0, rewinds: 0 })
    )

    const overview = db.getStatsOverview()
    expect(overview.today).toMatchObject({
      wordsRead: 500,
      sessionCount: 1,
      quotaPercent: 50,
      quotaMet: false,
      fluency: 100
    })
    expect(overview.streak).toBe(0)
  })

  it('folds before answering, so a read never reports a stale day', () => {
    vi.useFakeTimers()
    const db = new Database(storePath)

    setNow(at(2026, 8, 10, 9))
    db.recordSessionStats(session({ startedAt: at(2026, 8, 10, 9), wordsRead: 1200 }))
    setNow(at(2026, 8, 11, 9))

    expect(db.getStatsOverview().today.wordsRead).toBe(0)
    expect(readStoredStats().sessions).toEqual([])
  })
})

// ── Export / import surface (issue 03) ─────────────────────────────────────

describe('getStatsCollection / replaceStats', () => {
  it('exports both tiers, folded, and hands back copies', () => {
    vi.useFakeTimers()
    const db = new Database(storePath)

    setNow(at(2026, 8, 11, 9))
    db.recordSessionStats(session({ startedAt: at(2026, 8, 11, 9), wordsRead: 1200 }))
    setNow(at(2026, 8, 12, 9))
    db.recordSessionStats(session({ startedAt: at(2026, 8, 12, 9), wordsRead: 800 }))

    const collection = db.getStatsCollection()

    expect(collection.days.map((day) => day.date)).toEqual(['2026-08-11', '2026-08-12'])
    expect(collection.sessions).toHaveLength(1)
    expect(collection.sessions[0].wordsRead).toBe(800)

    // Wall time scores nothing (ADR-0036 §4) but still travels: the day record
    // carries its `wallMs` sum and the session its raw start/end instants.
    expect(collection.days[0].wallMs).toBe(600_000)
    expect(collection.sessions[0]).toMatchObject({
      startedAt: at(2026, 8, 12, 9),
      endedAt: at(2026, 8, 12, 9) + 600_000
    })

    collection.days[0].wordsRead = 0
    collection.sessions.pop()
    expect(db.getStatsDays()[0].wordsRead).toBe(1200)
    expect(db.getTodaySessionStats()).toHaveLength(1)
  })

  it('replaces the whole collection, persists it, and drops what it cannot read', () => {
    vi.useFakeTimers()
    setNow(at(2026, 8, 12, 9))
    const db = new Database(storePath)
    db.recordSessionStats(session({ startedAt: at(2026, 8, 12, 9), wordsRead: 500 }))

    db.replaceStats({
      days: [dayRecord({ date: '2026-08-01' }), { date: 'not-a-date' }],
      sessions: [session({ startedAt: at(2026, 8, 12, 8), wordsRead: 300 }), null]
    })

    // Wholesale: the day the store had derived for itself is gone, not merged.
    expect(db.getStatsDays().map((day) => day.date)).toEqual(['2026-08-01', '2026-08-12'])
    expect(db.getStatsDays().find((day) => day.date === '2026-08-12')?.wordsRead).toBe(300)
    expect(db.getTodaySessionStats()).toHaveLength(1)
    expect(readStoredStats().days[0]).toEqual(dayRecord({ date: '2026-08-01' }))
  })

  it('accepts a payload with no stats at all as an empty history', () => {
    vi.useFakeTimers()
    setNow(at(2026, 8, 12, 9))
    const db = new Database(storePath)
    db.recordSessionStats(session({ startedAt: at(2026, 8, 12, 9) }))

    db.replaceStats(undefined)

    expect(db.getStatsDays()).toEqual([])
    expect(db.getTodaySessionStats()).toEqual([])
    expect(readStoredStats()).toEqual({ days: [], sessions: [] })
  })
})

// ── Pinned decisions ───────────────────────────────────────────────────────

describe('stats are independent of the library', () => {
  it('leaves stats untouched when the text they came from is deleted', () => {
    vi.useFakeTimers()
    setNow(at(2026, 8, 12, 9))
    const db = new Database(storePath)
    const text = db.saveText({ title: 'Disposable', content: 'one two three' })

    db.recordSessionStats(
      session({ startedAt: at(2026, 8, 12, 9), textId: text.id!, title: 'Disposable' })
    )
    const before = db.getStatsDays()

    db.deleteText(text.id!)

    expect(db.getText(text.id!)).toBeNull()
    expect(db.getStatsDays()).toEqual(before)
    // The title snapshot is what keeps the orphaned session displayable.
    expect(db.getTodaySessionStats()[0]).toMatchObject({ textId: text.id, title: 'Disposable' })
  })
})

describe('reading goal settings keys', () => {
  it('survive the flatten/split bridge', () => {
    const store = settingsStoreFromFlat({ daily_word_quota: 2500, weekly_quota_days: 3 })

    expect(store.global.daily_word_quota).toBe(2500)
    expect(store.global.weekly_quota_days).toBe(3)
    expect(flattenSettingsStore(store)).toMatchObject({
      daily_word_quota: 2500,
      weekly_quota_days: 3
    })
  })

  it('default to a 1000-word quota over 5 days a week', () => {
    expect(flattenSettingsStore(settingsStoreFromFlat({}))).toMatchObject({
      daily_word_quota: 1000,
      weekly_quota_days: 5
    })
  })

  it('persist through the store and clamp a zero quota to the default', () => {
    const db = new Database(storePath)
    db.saveSettings({ daily_word_quota: 3000, weekly_quota_days: 7 })

    const reopened = new Database(storePath)
    expect(reopened.getSettings()).toMatchObject({
      daily_word_quota: 3000,
      weekly_quota_days: 7
    })

    reopened.saveSettings({ daily_word_quota: 0 })
    expect(reopened.getSettings().daily_word_quota).toBe(1000)
  })
})
