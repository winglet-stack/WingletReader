import { describe, expect, it } from 'vitest'
import {
  DAYS_PER_WEEK,
  DEFAULT_WEEKLY_TARGET_DAYS,
  GAP_CLAMP_FACTOR,
  GAP_CLAMP_FLOOR_MS,
  MAX_QUOTA_PAGES,
  MIN_QUOTA_PAGES,
  MIN_WEEKLY_TARGET_DAYS,
  POINTS_BASE,
  POINTS_MULTIPLIER_CAP,
  POINTS_STREAK_STEP,
  QUOTA_PAGE_WORDS,
  addDaysToKey,
  collateMonth,
  collateTotal,
  collateWeek,
  creditedGapMs,
  deriveSessionBaseline,
  deriveStreak,
  deviationPercent,
  emptyDaySums,
  fluencyScore,
  foldSessionsIntoDay,
  interruptionRate,
  localDateKey,
  maxCreditedGapMs,
  measuredWpm,
  pointsForDay,
  quotaPagesFromWords,
  quotaWordsFromPages,
  restDayBudgets,
  sessionMetrics,
  weekStartKey,
  type DayStats,
  type SessionSums,
  type StreakDay
} from '../statsMath'

/**
 * Fixtures-as-code. Every date literal is a **local** calendar date, so the
 * suite is timezone-agnostic: it never asserts a UTC offset, only that
 * calendar arithmetic behaves like a calendar.
 */
function session(overrides: Partial<SessionSums> = {}): SessionSums {
  return { wordsRead: 0, wallMs: 0, activeMs: 0, pauses: 0, rewinds: 0, ...overrides }
}

function day(date: string, overrides: Partial<DayStats> = {}): DayStats {
  return {
    ...emptyDaySums(),
    date,
    quotaTargetWords: 1000,
    weeklyTargetDays: DEFAULT_WEEKLY_TARGET_DAYS,
    quotaMet: false,
    points: 0,
    ...overrides
  }
}

/**
 * Build streak days from a pattern string starting at `startKey`, one
 * character per local day:
 * `x` = recorded, quota met · `.` = recorded, quota missed · `-` = no record.
 */
function streakDays(
  startKey: string,
  pattern: string,
  weeklyTargetDays = DEFAULT_WEEKLY_TARGET_DAYS
): StreakDay[] {
  const out: StreakDay[] = []
  pattern.split('').forEach((mark, index) => {
    if (mark === '-') return
    out.push({ date: addDaysToKey(startKey, index), quotaMet: mark === 'x', weeklyTargetDays })
  })
  return out
}

describe('constants', () => {
  it('pins the ADR-0035 §5 quota/points constants', () => {
    expect(QUOTA_PAGE_WORDS).toBe(500)
    expect(POINTS_BASE).toBe(100)
    expect(POINTS_STREAK_STEP).toBe(0.1)
    expect(POINTS_MULTIPLIER_CAP).toBe(2.0)
    expect(DAYS_PER_WEEK).toBe(7)
    expect(DEFAULT_WEEKLY_TARGET_DAYS).toBe(5)
  })

  it('pins the settable goal ranges the Settings steppers offer', () => {
    expect(MIN_QUOTA_PAGES).toBe(1)
    expect(MAX_QUOTA_PAGES).toBe(20)
    expect(MIN_WEEKLY_TARGET_DAYS).toBe(1)
  })

  it('pins the ADR-0036 §7 integrity constants', () => {
    expect(GAP_CLAMP_FACTOR).toBe(4)
    expect(GAP_CLAMP_FLOOR_MS).toBe(10_000)
  })
})

describe('maxCreditedGapMs', () => {
  it('lets the floor govern at ordinary and fast tempos', () => {
    // 120 BPM: four 500 ms beats is 2 s, well under the floor.
    expect(maxCreditedGapMs(120)).toBe(GAP_CLAMP_FLOOR_MS)
    // 650 BPM (the settable ceiling): four beats is ~369 ms.
    expect(maxCreditedGapMs(650)).toBe(GAP_CLAMP_FLOOR_MS)
  })

  it('lets the tempo term govern at slow tempos', () => {
    // 5 BPM: a 12 s beat, so four of them is 48 s.
    expect(maxCreditedGapMs(5)).toBe(48_000)
    expect(maxCreditedGapMs(10)).toBe(24_000)
  })

  it('crosses over at 24 BPM, where four beats is exactly the floor', () => {
    expect(maxCreditedGapMs(24)).toBe(GAP_CLAMP_FLOOR_MS)
    expect(maxCreditedGapMs(25)).toBe(GAP_CLAMP_FLOOR_MS)
    expect(maxCreditedGapMs(23)).toBeGreaterThan(GAP_CLAMP_FLOOR_MS)
  })

  it('falls back to the floor for an unusable BPM rather than an infinite clamp', () => {
    expect(maxCreditedGapMs(0)).toBe(GAP_CLAMP_FLOOR_MS)
    expect(maxCreditedGapMs(-120)).toBe(GAP_CLAMP_FLOOR_MS)
    expect(maxCreditedGapMs(Number.NaN)).toBe(GAP_CLAMP_FLOOR_MS)
  })
})

describe('creditedGapMs', () => {
  it('credits a gap inside the clamp in full', () => {
    expect(creditedGapMs(500, 120)).toBe(500)
    expect(creditedGapMs(9_999, 120)).toBe(9_999)
  })

  it('caps a gap beyond the clamp at the clamp', () => {
    expect(creditedGapMs(5 * 60_000, 120)).toBe(10_000)
    expect(creditedGapMs(5 * 60_000, 5)).toBe(48_000)
  })

  it('clamps a negative or unusable elapsed time at zero (clock skew)', () => {
    expect(creditedGapMs(-1_000, 120)).toBe(0)
    expect(creditedGapMs(Number.NaN, 120)).toBe(0)
  })
})

describe('quota page ↔ word conversion', () => {
  it('converts exact multiples both ways', () => {
    expect(quotaPagesFromWords(500)).toBe(1)
    expect(quotaPagesFromWords(1000)).toBe(2)
    expect(quotaPagesFromWords(10_000)).toBe(20)
    expect(quotaWordsFromPages(1)).toBe(500)
    expect(quotaWordsFromPages(2)).toBe(1000)
    expect(quotaWordsFromPages(20)).toBe(10_000)
  })

  it('rounds a legacy non-multiple value UP to whole quota pages', () => {
    expect(quotaPagesFromWords(1200)).toBe(3)
    expect(quotaPagesFromWords(501)).toBe(2)
    expect(quotaPagesFromWords(999)).toBe(2)
    expect(quotaPagesFromWords(1)).toBe(1)
  })

  it('never reports fewer than one page, whatever the store holds', () => {
    expect(quotaPagesFromWords(0)).toBe(MIN_QUOTA_PAGES)
    expect(quotaPagesFromWords(-500)).toBe(MIN_QUOTA_PAGES)
    expect(quotaPagesFromWords(Number.NaN)).toBe(MIN_QUOTA_PAGES)
    expect(quotaPagesFromWords(Number.NEGATIVE_INFINITY)).toBe(MIN_QUOTA_PAGES)
    // An infinity is just an out-of-range number; only NaN needs a default.
    expect(quotaPagesFromWords(Number.POSITIVE_INFINITY)).toBe(MAX_QUOTA_PAGES)
  })

  it('clamps a legacy value above the settable range to the maximum page', () => {
    expect(quotaPagesFromWords(50_000)).toBe(MAX_QUOTA_PAGES)
    expect(quotaWordsFromPages(99)).toBe(MAX_QUOTA_PAGES * QUOTA_PAGE_WORDS)
    expect(quotaWordsFromPages(0)).toBe(MIN_QUOTA_PAGES * QUOTA_PAGE_WORDS)
    expect(quotaWordsFromPages(Number.NaN)).toBe(MIN_QUOTA_PAGES * QUOTA_PAGE_WORDS)
  })

  it('round-trips every in-range page count', () => {
    for (let pages = MIN_QUOTA_PAGES; pages <= MAX_QUOTA_PAGES; pages += 1) {
      expect(quotaPagesFromWords(quotaWordsFromPages(pages))).toBe(pages)
    }
  })

  it('is idempotent on a rounded-up legacy value: re-reading does not drift', () => {
    // 1,200 words displays as 3 pages; only a user edit writes 1,500 back.
    const displayed = quotaPagesFromWords(1200)
    expect(quotaPagesFromWords(quotaWordsFromPages(displayed))).toBe(displayed)
  })
})

describe('localDateKey', () => {
  const cases: [string, Date, string][] = [
    ['midday', new Date(2026, 7, 12, 13, 30), '2026-08-12'],
    ['local midnight', new Date(2026, 0, 1, 0, 0, 0), '2026-01-01'],
    ['one second before midnight', new Date(2025, 11, 31, 23, 59, 59), '2025-12-31'],
    ['zero-pads month and day', new Date(2026, 2, 5, 9), '2026-03-05'],
    ['leap day', new Date(2028, 1, 29, 12), '2028-02-29']
  ]

  it.each(cases)('%s → %s', (_label, date, expected) => {
    expect(localDateKey(date.getTime())).toBe(expected)
  })
})

describe('addDaysToKey', () => {
  const cases: [string, number, string][] = [
    ['2026-08-12', 1, '2026-08-13'],
    ['2026-08-12', -1, '2026-08-11'],
    ['2026-08-31', 1, '2026-09-01'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-02-28', 1, '2026-03-01'],
    ['2026-08-12', 0, '2026-08-12'],
    ['2025-12-29', 7, '2026-01-05']
  ]

  it.each(cases)('%s + %i days → %s', (key, delta, expected) => {
    expect(addDaysToKey(key, delta)).toBe(expected)
  })

  it('walks calendar days across a DST changeover window without drift', () => {
    // Spring-forward and fall-back both live inside this span in every locale
    // that observes DST; a ms-based walk would skip or repeat a date.
    const walked: string[] = []
    let key = '2026-03-01'
    for (let i = 0; i < 60; i += 1) {
      walked.push(key)
      key = addDaysToKey(key, 1)
    }
    expect(walked).toHaveLength(60)
    expect(new Set(walked).size).toBe(60)
    expect(walked[30]).toBe('2026-03-31')
    expect(walked[31]).toBe('2026-04-01')
    expect(key).toBe('2026-04-30')
  })
})

describe('weekStartKey', () => {
  const cases: [string, string][] = [
    ['2026-08-10', '2026-08-10'], // Monday maps to itself
    ['2026-08-12', '2026-08-10'], // Wednesday
    ['2026-08-16', '2026-08-10'], // Sunday closes the Monday-start week
    ['2026-08-17', '2026-08-17'], // next Monday
    ['2026-01-01', '2025-12-29'], // Thursday — week straddles the year boundary
    ['2026-01-04', '2025-12-29'],
    ['2026-01-05', '2026-01-05']
  ]

  it.each(cases)('%s belongs to the week starting %s', (key, expected) => {
    expect(weekStartKey(key)).toBe(expected)
  })
})

describe('interruptionRate', () => {
  const cases: [string, { pauses: number; rewinds: number; activeMs: number }, number][] = [
    ['clean read', { pauses: 0, rewinds: 0, activeMs: 60_000 }, 0],
    ['rewinds weigh double', { pauses: 2, rewinds: 1, activeMs: 60_000 }, 4],
    ['per active minute', { pauses: 2, rewinds: 1, activeMs: 120_000 }, 2],
    ['sub-minute read', { pauses: 1, rewinds: 0, activeMs: 30_000 }, 2],
    ['zero active, nothing counted', { pauses: 0, rewinds: 0, activeMs: 0 }, 0],
    ['zero active, interruptions', { pauses: 1, rewinds: 0, activeMs: 0 }, Infinity],
    ['negative active clamps to zero', { pauses: 0, rewinds: 1, activeMs: -5_000 }, Infinity],
    ['negative counts clamp to zero', { pauses: -3, rewinds: -2, activeMs: 60_000 }, 0]
  ]

  it.each(cases)('%s → %s', (_label, input, expected) => {
    expect(interruptionRate(input)).toBe(expected)
  })
})

describe('fluencyScore', () => {
  const cases: [number, number][] = [
    [0, 100],
    [0.5, 67],
    [1, 50],
    [3, 25],
    [9, 10],
    [Infinity, 0],
    [-2, 100], // a negative rate is impossible; treat it as clean rather than >100
    [NaN, 0]
  ]

  it.each(cases)('rate %s → fluency %i', (rate, expected) => {
    expect(fluencyScore(rate)).toBe(expected)
  })

  it('pins the zero-active-time fork end to end', () => {
    expect(fluencyScore(interruptionRate({ pauses: 0, rewinds: 0, activeMs: 0 }))).toBe(100)
    expect(fluencyScore(interruptionRate({ pauses: 1, rewinds: 0, activeMs: 0 }))).toBe(0)
    expect(fluencyScore(interruptionRate({ pauses: 0, rewinds: 1, activeMs: 0 }))).toBe(0)
  })
})

describe('measuredWpm', () => {
  const cases: [string, { wordsRead: number; activeMs: number }, number][] = [
    ['two minutes', { wordsRead: 600, activeMs: 120_000 }, 300],
    ['half a minute', { wordsRead: 250, activeMs: 30_000 }, 500],
    ['zero active time', { wordsRead: 400, activeMs: 0 }, 0],
    ['negative active time clamps to zero', { wordsRead: 400, activeMs: -1_000 }, 0],
    ['negative words clamp to zero', { wordsRead: -400, activeMs: 60_000 }, 0],
    ['no words', { wordsRead: 0, activeMs: 60_000 }, 0]
  ]

  it.each(cases)('%s → %i wpm', (_label, input, expected) => {
    expect(measuredWpm(input)).toBe(expected)
  })

  it('returns the unrounded ratio so averaging keeps its precision', () => {
    expect(measuredWpm({ wordsRead: 100, activeMs: 90_000 })).toBeCloseTo(200 / 3, 10)
  })
})

describe('foldSessionsIntoDay', () => {
  it('folds an empty day to zeros', () => {
    expect(foldSessionsIntoDay([])).toEqual(emptyDaySums())
  })

  it('sums raw counters and counts sessions', () => {
    const folded = foldSessionsIntoDay([
      session({ wordsRead: 500, wallMs: 600_000, activeMs: 540_000, pauses: 2, rewinds: 1 }),
      session({ wordsRead: 300, wallMs: 200_000, activeMs: 180_000, pauses: 0, rewinds: 0 })
    ])
    expect(folded).toMatchObject({
      wordsRead: 800,
      wallMs: 800_000,
      activeMs: 720_000,
      pauses: 2,
      rewinds: 1,
      sessionCount: 2
    })
  })

  it('keeps the longest session by active time and the best session fluency', () => {
    const folded = foldSessionsIntoDay([
      // 4 interruptions over 9 active minutes → rate 0.44 → fluency 69
      session({ wallMs: 600_000, activeMs: 540_000, pauses: 2, rewinds: 1 }),
      // clean 3-minute read → fluency 100, but the shorter session
      session({ wallMs: 200_000, activeMs: 180_000 }),
      // longest wall clock, worst fluency — and only a minute of reading in it
      session({ wallMs: 900_000, activeMs: 60_000, pauses: 4, rewinds: 3 })
    ])
    // The 15-minute span with one active minute does not take the highscore
    // (ADR-0036 §4); the 9 active minutes of the first session do.
    expect(folded.longestSessionMs).toBe(540_000)
    expect(folded.bestSessionFluency).toBe(100)
    expect(folded.sessionCount).toBe(3)
  })

  it('raises the longest session only by a paused session’s active time', () => {
    // Lunch with the Reader open: a two-hour span, four minutes of reading.
    const parked = foldSessionsIntoDay([session({ wallMs: 7_200_000, activeMs: 240_000 })])
    expect(parked.longestSessionMs).toBe(240_000)
    // The span itself is still summed — descriptive, and it feeds no score.
    expect(parked.wallMs).toBe(7_200_000)
  })

  it('scores a sessionless day 0 fluency rather than a phantom 100', () => {
    expect(foldSessionsIntoDay([]).bestSessionFluency).toBe(0)
  })

  it('clamps negative durations and counts (clock skew) to zero', () => {
    const folded = foldSessionsIntoDay([
      session({ wordsRead: -50, wallMs: -1_000, activeMs: -1_000, pauses: -2, rewinds: -1 }),
      session({ wordsRead: 100, wallMs: 60_000, activeMs: 60_000 })
    ])
    expect(folded).toMatchObject({
      wordsRead: 100,
      wallMs: 60_000,
      activeMs: 60_000,
      pauses: 0,
      rewinds: 0,
      sessionCount: 2,
      longestSessionMs: 60_000
    })
  })

  it('does not mutate its inputs', () => {
    const sessions = [session({ wordsRead: 10, wallMs: 1_000, activeMs: 1_000 })]
    const snapshot = JSON.stringify(sessions)
    foldSessionsIntoDay(sessions)
    expect(JSON.stringify(sessions)).toBe(snapshot)
  })
})

describe('pointsForDay', () => {
  const cases: [number, number][] = [
    [1, 100],
    [2, 110],
    [4, 130], // guards the 1.3000000000000003 float drift
    [10, 190],
    [11, 200], // multiplier cap reached
    [12, 200],
    [365, 200],
    [0, 100], // defensive: quota-met days always carry a streak of at least 1
    [-4, 100],
    [3.7, 120]
  ]

  it.each(cases)('streak %s → %i points', (streak, expected) => {
    expect(pointsForDay(streak)).toBe(expected)
  })

  it('never exceeds the capped multiplier', () => {
    expect(pointsForDay(9999)).toBe(POINTS_BASE * POINTS_MULTIPLIER_CAP)
  })
})

describe('deriveStreak', () => {
  const MONDAY = '2026-08-03'
  const sunday = (start: string) => addDaysToKey(start, 6)

  it('is zero with no history', () => {
    expect(deriveStreak([], '2026-08-12')).toBe(0)
  })

  const basics: [string, string, number, number][] = [
    ['a perfect week', 'xxxxxxx', DEFAULT_WEEKLY_TARGET_DAYS, 7],
    ['misses exactly at budget keep the streak', 'xx--xxx', DEFAULT_WEEKLY_TARGET_DAYS, 5],
    ['one miss past budget breaks it', 'x---xxx', DEFAULT_WEEKLY_TARGET_DAYS, 3],
    ['recorded-but-unmet days are misses too', 'x...xxx', DEFAULT_WEEKLY_TARGET_DAYS, 3],
    ['a 7-day target has no rest days', 'x-xxxxx', DAYS_PER_WEEK, 5],
    ['a 1-day target tolerates six misses', 'x------', 1, 1]
  ]

  it.each(basics)('%s → %i', (_label, pattern, weeklyTarget, expected) => {
    const days = streakDays(MONDAY, pattern, weeklyTarget)
    expect(deriveStreak(days, sunday(MONDAY))).toBe(expected)
  })

  it('treats absent days and unmet records identically', () => {
    const absent = deriveStreak(streakDays(MONDAY, 'xx--xxx'), sunday(MONDAY))
    const recorded = deriveStreak(streakDays(MONDAY, 'xx..xxx'), sunday(MONDAY))
    expect(absent).toBe(recorded)
  })

  it('does not count today as a miss while the day is still in progress', () => {
    // Mon–Wed met, today is Thursday with nothing read yet.
    const thursday = addDaysToKey(MONDAY, 3)
    expect(deriveStreak(streakDays(MONDAY, 'xxx'), thursday)).toBe(3)
    expect(deriveStreak(streakDays(MONDAY, 'xxx.'), thursday)).toBe(3)
    // …and meeting the quota today extends it.
    expect(deriveStreak(streakDays(MONDAY, 'xxxx'), thursday)).toBe(4)
  })

  it('ignores day records dated after today', () => {
    const wednesday = addDaysToKey(MONDAY, 2)
    expect(deriveStreak(streakDays(MONDAY, 'xxxxxxx'), wednesday)).toBe(3)
  })

  it('resolves duplicate date records to the last entry', () => {
    const days: StreakDay[] = [
      { date: MONDAY, quotaMet: false, weeklyTargetDays: 5 },
      { date: MONDAY, quotaMet: true, weeklyTargetDays: 5 }
    ]
    expect(deriveStreak(days, MONDAY)).toBe(1)
  })

  describe('edge cases', () => {
    it('partial first week: install mid-week charges nothing before the first record', () => {
      // History starts Thursday; the strictest target (7/7, zero rest days)
      // must not retro-penalise Mon–Wed.
      const thursday = '2026-08-06'
      const friday = '2026-08-07'
      expect(deriveStreak(streakDays(thursday, 'xx', DAYS_PER_WEEK), friday)).toBe(2)
    })

    it('weekly target changed mid-week: the first snapshot in the week wins', () => {
      const loosenedLate: StreakDay[] = [
        { date: '2026-08-03', quotaMet: true, weeklyTargetDays: 7 }, // budget 0 when it was set
        { date: '2026-08-05', quotaMet: true, weeklyTargetDays: 5 } // relaxed to budget 2
      ]
      // Tuesday is absent and the Monday pin leaves no rest-day budget, so the
      // break stays broken even after Wednesday's looser setting snapshot.
      expect(deriveStreak(loosenedLate, '2026-08-05')).toBe(1)

      const tightenedLate: StreakDay[] = [
        { date: '2026-08-03', quotaMet: true, weeklyTargetDays: 5 }, // budget 2 when it was set
        { date: '2026-08-05', quotaMet: true, weeklyTargetDays: 7 } // tightened to budget 0
      ]
      // The Monday budget of two remains in force, so Tuesday is still a
      // permitted rest day and both recorded days remain in the streak.
      expect(deriveStreak(tightenedLate, '2026-08-05')).toBe(2)
    })

    it('unit-pins rest-day budgets to the first snapshot in each Monday week', () => {
      const history: StreakDay[] = [
        { date: '2026-08-05', quotaMet: true, weeklyTargetDays: 5 },
        { date: '2026-08-03', quotaMet: true, weeklyTargetDays: 6 },
        { date: '2026-08-12', quotaMet: true, weeklyTargetDays: 6 },
        { date: '2026-08-03', quotaMet: true, weeklyTargetDays: 7 },
        { date: '2026-08-10', quotaMet: true, weeklyTargetDays: 4 }
      ]

      expect(restDayBudgets(history, '2026-08-12')).toEqual(
        new Map([
          ['2026-08-03', 0],
          ['2026-08-10', 3]
        ])
      )
    })

    it('gap weeks: an entirely missed week breaks the streak at any target', () => {
      for (const weeklyTarget of [1, 3, 5, 7]) {
        const days = [
          ...streakDays('2026-08-03', 'xxxxxxx', weeklyTarget), // full week
          ...streakDays('2026-08-17', 'xxx', weeklyTarget) // after a blank week
        ]
        expect(deriveStreak(days, '2026-08-19')).toBe(3)
      }
    })

    it('carries the last known target into a week with no records', () => {
      // The blank week inherits the 1-day target (budget 6) and still breaks:
      // seven misses exceeds even the largest budget.
      const days = [
        ...streakDays('2026-08-03', 'xxxxxxx', 1),
        ...streakDays('2026-08-17', 'x', 1)
      ]
      expect(deriveStreak(days, '2026-08-17')).toBe(1)
    })

    it('exact-budget boundary: budget keeps, budget+1 breaks, in the same week', () => {
      const atBudget = streakDays(MONDAY, 'xxx--xx') // 2 misses, budget 2
      const overBudget = streakDays(MONDAY, 'xxx---x') // 3 misses, budget 2
      expect(deriveStreak(atBudget, sunday(MONDAY))).toBe(5)
      expect(deriveStreak(overBudget, sunday(MONDAY))).toBe(1)
    })

    it('budgets are per week, so misses do not pool across a week boundary', () => {
      // Two misses in each of two adjacent weeks: four misses, no break.
      const days = [
        ...streakDays('2026-08-03', 'xxxxx--'),
        ...streakDays('2026-08-10', '--xxxxx')
      ]
      expect(deriveStreak(days, '2026-08-16')).toBe(10)

      // The same four misses inside one week breaks it.
      const crammed = streakDays('2026-08-03', 'xxx----')
      expect(deriveStreak([...crammed, ...streakDays('2026-08-10', 'xxxxxxx')], '2026-08-16')).toBe(
        7
      )
    })

    it('year boundary: weeks are Monday-start, not calendar-year-clipped', () => {
      // Mon 2025-12-29 → Sun 2026-01-04 is one week spanning the year change.
      const acrossNewYear = [
        ...streakDays('2025-12-29', 'xx--xxx'), // 2 misses, budget 2 → survives
        ...streakDays('2026-01-05', 'xx--xxx') // 2 misses in the next week → survives
      ]
      expect(deriveStreak(acrossNewYear, '2026-01-11')).toBe(10)

      // If the year boundary were treated as a week boundary, these four misses
      // would split 2/2 and survive; as one week they break the streak.
      const oneBrokenWeek = streakDays('2025-12-29', 'xxx----')
      expect(deriveStreak(oneBrokenWeek, '2026-01-04')).toBe(0)
    })

    it('DST boundary: a long run counts calendar days, not 24-hour blocks', () => {
      // 2026-03-01 → 2026-04-05 is 36 local days in every timezone, DST or not.
      const pattern = 'x'.repeat(36)
      const days = streakDays('2026-03-01', pattern, DAYS_PER_WEEK)
      expect(days).toHaveLength(36)
      expect(days[35].date).toBe('2026-04-05')
      expect(deriveStreak(days, '2026-04-05')).toBe(36)
    })
  })

  it('feeds pointsForDay the streak that includes today', () => {
    const days = streakDays(MONDAY, 'xxxx')
    const streak = deriveStreak(days, addDaysToKey(MONDAY, 3))
    expect(streak).toBe(4)
    expect(pointsForDay(streak)).toBe(130)
  })
})

describe('collateWeek', () => {
  const days = [
    day('2026-08-10', { wordsRead: 500, wallMs: 60_000, sessionCount: 1, quotaMet: true, points: 100 }),
    day('2026-08-12', { wordsRead: 300, wallMs: 30_000, sessionCount: 2, points: 0 }),
    day('2026-08-20', { wordsRead: 999 }) // next week — must not leak in
  ]

  it('returns seven Monday-first buckets for the anchor week', () => {
    const buckets = collateWeek(days, '2026-08-12')
    expect(buckets.map((b) => b.key)).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
      '2026-08-15',
      '2026-08-16'
    ])
  })

  it('sums matching days and zero-fills the rest', () => {
    const buckets = collateWeek(days, '2026-08-12')
    expect(buckets[0]).toMatchObject({ wordsRead: 500, quotaMetDays: 1, points: 100 })
    expect(buckets[1]).toMatchObject({ wordsRead: 0, sessionCount: 0, dayKeys: [] })
    expect(buckets[2]).toMatchObject({ wordsRead: 300, sessionCount: 2, quotaMetDays: 0 })
    expect(buckets.reduce((sum, b) => sum + b.wordsRead, 0)).toBe(800)
  })

  it('anchors on the week, not the anchor day (Sunday resolves to its Monday)', () => {
    expect(collateWeek(days, '2026-08-16')[0].key).toBe('2026-08-10')
  })

  it('carries maxima rather than summing them', () => {
    const buckets = collateWeek(
      [
        day('2026-08-10', { longestSessionMs: 900_000, bestSessionFluency: 80 }),
        day('2026-08-11', { longestSessionMs: 300_000, bestSessionFluency: 95 })
      ],
      '2026-08-10'
    )
    expect(buckets[0]).toMatchObject({ longestSessionMs: 900_000, bestSessionFluency: 80 })
    expect(buckets[1]).toMatchObject({ longestSessionMs: 300_000, bestSessionFluency: 95 })
  })
})

describe('collateMonth', () => {
  it('returns one zero-filled bucket per day of the anchor month', () => {
    const buckets = collateMonth([day('2026-08-12', { wordsRead: 700 })], '2026-08-12')
    expect(buckets).toHaveLength(31)
    expect(buckets[0].key).toBe('2026-08-01')
    expect(buckets[30].key).toBe('2026-08-31')
    expect(buckets[11]).toMatchObject({ key: '2026-08-12', wordsRead: 700, dayKeys: ['2026-08-12'] })
  })

  const lengths: [string, number][] = [
    ['2026-02-15', 28],
    ['2028-02-01', 29], // leap year
    ['2026-04-30', 30],
    ['2026-12-31', 31]
  ]

  it.each(lengths)('anchor %s spans %i days', (anchor, expected) => {
    expect(collateMonth([], anchor)).toHaveLength(expected)
  })

  it('excludes days outside the anchor month', () => {
    const buckets = collateMonth(
      [day('2026-07-31', { wordsRead: 100 }), day('2026-09-01', { wordsRead: 100 })],
      '2026-08-12'
    )
    expect(buckets.reduce((sum, b) => sum + b.wordsRead, 0)).toBe(0)
  })
})

describe('collateTotal', () => {
  it('collates nothing from an empty history', () => {
    expect(collateTotal([])).toEqual([])
  })

  it('buckets by calendar month from first record to last, gaps included', () => {
    const buckets = collateTotal([
      day('2025-11-30', { wordsRead: 100, quotaMet: true, points: 100 }),
      day('2026-01-02', { wordsRead: 400, sessionCount: 3 }),
      day('2026-01-20', { wordsRead: 600, sessionCount: 1, quotaMet: true, points: 110 })
    ])
    expect(buckets.map((b) => b.key)).toEqual(['2025-11', '2025-12', '2026-01'])
    expect(buckets[0]).toMatchObject({ wordsRead: 100, quotaMetDays: 1, points: 100 })
    expect(buckets[1]).toMatchObject({ wordsRead: 0, dayKeys: [] })
    expect(buckets[2]).toMatchObject({
      wordsRead: 1000,
      sessionCount: 4,
      quotaMetDays: 1,
      points: 110,
      dayKeys: ['2026-01-02', '2026-01-20']
    })
  })

  it('collates a single day into a single month bucket', () => {
    expect(collateTotal([day('2026-08-12', { wordsRead: 5 })])).toEqual([
      expect.objectContaining({ key: '2026-08', wordsRead: 5, dayKeys: ['2026-08-12'] })
    ])
  })

  it('clamps negative sums out of the buckets', () => {
    const buckets = collateTotal([
      day('2026-08-12', { wordsRead: -50, wallMs: -1, activeMs: -1, sessionCount: -2, points: -10 })
    ])
    expect(buckets[0]).toMatchObject({
      wordsRead: 0,
      wallMs: 0,
      activeMs: 0,
      sessionCount: 0,
      points: 0
    })
  })

  it('does not mutate the day records it collates', () => {
    const days = [day('2026-08-12', { wordsRead: 42 })]
    const snapshot = JSON.stringify(days)
    collateTotal(days)
    collateWeek(days, '2026-08-12')
    collateMonth(days, '2026-08-12')
    expect(JSON.stringify(days)).toBe(snapshot)
  })
})

// ── Session dialog metrics + baseline ladder (ADR-0035 §6) ───────────────────

const MINUTE = 60_000

describe('sessionMetrics', () => {
  it('promotes raw sums to the six displayed numbers', () => {
    const metrics = sessionMetrics(
      session({ wordsRead: 600, wallMs: 4 * MINUTE, activeMs: 3 * MINUTE, pauses: 1, rewinds: 1 })
    )
    expect(metrics).toEqual({
      wordsRead: 600,
      wallMs: 4 * MINUTE,
      activeMs: 3 * MINUTE,
      pauses: 1,
      rewinds: 1,
      wpm: 200,
      // rate = (2×1 + 1) / 3 min = 1 → 100 / 2
      fluency: 50
    })
  })

  it('leaves the wpm unrounded and clamps negative sums', () => {
    expect(sessionMetrics(session({ wordsRead: 100, activeMs: 90_000 })).wpm).toBeCloseTo(66.67, 2)
    expect(sessionMetrics(session({ wordsRead: -5, wallMs: -1, pauses: -2 }))).toMatchObject({
      wordsRead: 0,
      wallMs: 0,
      pauses: 0,
      fluency: 100
    })
  })
})

describe('deriveSessionBaseline', () => {
  const earlier = [
    session({ wordsRead: 400, wallMs: 6 * MINUTE, activeMs: 4 * MINUTE, pauses: 2, rewinds: 1 }),
    session({ wordsRead: 800, wallMs: 10 * MINUTE, activeMs: 8 * MINUTE, pauses: 2, rewinds: 1 })
  ]

  it("rung 1: averages today's earlier sessions", () => {
    const baseline = deriveSessionBaseline({
      earlierSessions: earlier,
      days: [day('2026-08-11', { wordsRead: 9999, sessionCount: 1 })],
      todayKey: '2026-08-12'
    })
    expect(baseline).toEqual({
      source: 'today',
      sessionCount: 2,
      date: null,
      wordsRead: 600,
      wallMs: 8 * MINUTE,
      activeMs: 6 * MINUTE,
      pauses: 2,
      rewinds: 1,
      // Ratios come off the totals: 1,200 words over 12 active minutes.
      wpm: 100,
      // rate = (2×2 + 4) / 12 min = 2/3 → 100 / (5/3)
      fluency: 60
    })
  })

  it('rung 2: falls back to the most recent prior active day, averaged per session', () => {
    const baseline = deriveSessionBaseline({
      earlierSessions: [],
      days: [
        day('2026-08-09', { wordsRead: 100, sessionCount: 1 }),
        // Skipped: recorded but with no sessions in it.
        day('2026-08-10', { wordsRead: 0, sessionCount: 0 }),
        day('2026-08-11', {
          wordsRead: 1500,
          wallMs: 30 * MINUTE,
          activeMs: 25 * MINUTE,
          pauses: 5,
          rewinds: 0,
          sessionCount: 3
        }),
        // Ignored: today's own record already contains the finished session.
        day('2026-08-12', { wordsRead: 700, sessionCount: 1 })
      ],
      todayKey: '2026-08-12'
    })
    expect(baseline).toEqual({
      source: 'prior-day',
      sessionCount: 3,
      date: '2026-08-11',
      wordsRead: 500,
      wallMs: 10 * MINUTE,
      activeMs: (25 * MINUTE) / 3,
      pauses: 5 / 3,
      rewinds: 0,
      wpm: 60,
      // rate = 5 / 25 min = 0.2 → 100 / 1.2, rounded
      fluency: 83
    })
  })

  it('rung 3: hides the comparison when there is no history at all', () => {
    expect(
      deriveSessionBaseline({ earlierSessions: [], days: [], todayKey: '2026-08-12' })
    ).toBeNull()
    expect(
      deriveSessionBaseline({
        earlierSessions: [],
        days: [day('2026-08-12', { wordsRead: 700, sessionCount: 1 })],
        todayKey: '2026-08-12'
      })
    ).toBeNull()
    expect(
      deriveSessionBaseline({
        earlierSessions: [],
        days: [day('2026-08-11', { sessionCount: 0 })],
        todayKey: '2026-08-12'
      })
    ).toBeNull()
  })

  it("prefers today's sessions over any prior day", () => {
    const baseline = deriveSessionBaseline({
      earlierSessions: [session({ wordsRead: 100, activeMs: MINUTE })],
      days: [day('2026-08-11', { wordsRead: 5000, sessionCount: 1 })],
      todayKey: '2026-08-12'
    })
    expect(baseline).toMatchObject({ source: 'today', sessionCount: 1, wordsRead: 100 })
  })

  it('does not mutate its inputs', () => {
    const days = [day('2026-08-11', { wordsRead: 300, sessionCount: 2 })]
    const sessions = [session({ wordsRead: 10 })]
    const snapshot = JSON.stringify({ days, sessions })
    deriveSessionBaseline({ earlierSessions: [], days, todayKey: '2026-08-12' })
    deriveSessionBaseline({ earlierSessions: sessions, days, todayKey: '2026-08-12' })
    expect(JSON.stringify({ days, sessions })).toBe(snapshot)
  })
})

describe('deviationPercent', () => {
  it('signs the change against the baseline', () => {
    expect(deviationPercent(120, 100)).toBe(20)
    expect(deviationPercent(80, 100)).toBe(-20)
    expect(deviationPercent(100, 100)).toBe(0)
  })

  it('has nothing to say against a zero or unusable baseline', () => {
    expect(deviationPercent(5, 0)).toBeNull()
    expect(deviationPercent(5, -1)).toBeNull()
    expect(deviationPercent(5, Number.NaN)).toBeNull()
    expect(deviationPercent(Number.POSITIVE_INFINITY, 10)).toBeNull()
  })
})
