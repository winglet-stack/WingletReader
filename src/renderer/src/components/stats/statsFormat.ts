/**
 * Display formatting shared by the hub stats banner and the Stats screen.
 * Word counts use `toLocaleString()` like every other count in the app.
 */

/** Wall/active durations at minute granularity — "2 h 05 min", "18 min", "under a minute". */
export function formatReadingTime(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`
  if (totalMinutes > 0) return `${minutes} min`
  return ms > 0 ? 'under a minute' : '0 min'
}

/** Any word count, in the app's one convention. */
export function formatWordCount(words: number): string {
  return Math.round(words).toLocaleString()
}

/**
 * A quota-page count. Fractional progress keeps one decimal ("1.6"), whole
 * pages drop it ("2") — the fraction is the point of the progress reading, but
 * a target of "2.0 pages" reads like a precision it does not have.
 */
export function formatPageCount(pages: number): string {
  const rounded = Math.round(pages * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** Measured reading speed — "312 wpm". */
export function formatWpm(wpm: number): string {
  return `${Math.round(wpm).toLocaleString()} wpm`
}

/** A day count with its unit — "3 days", "1 day". */
export function formatDayCount(days: number): string {
  return `${days.toLocaleString()} ${days === 1 ? 'day' : 'days'}`
}
