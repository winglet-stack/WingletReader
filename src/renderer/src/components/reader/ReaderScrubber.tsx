import React from 'react'

interface Props {
  currentIndex: number
  stacksLength: number
  /** 0..1 playback progress for the fill bar. */
  progress: number
  /** Fill transition duration, matched to the beat interval by the caller. */
  transitionMs: number
  /** Reread return point marker position (null/0 = no marker). */
  rereReadEndIndex: number | null
  /** Goal bookmark marker position (null/0 = no marker). */
  goalBookmarkIndex: number | null
  /** Normal bookmark marker positions, resolved from durable word offsets. */
  normalBookmarkMarkers: Array<{
    id: number
    label: string
    stackIndex: number
  }>
  onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export default function ReaderScrubber({
  currentIndex,
  stacksLength,
  progress,
  transitionMs,
  rereReadEndIndex,
  goalBookmarkIndex,
  normalBookmarkMarkers,
  onSeek,
}: Props) {
  const markerLeft = (index: number) => `${(Math.max(0, Math.min(index, stacksLength)) / stacksLength) * 100}%`

  return (
    <div className="reader-progress-wrap">
      <input
        type="range"
        className="reader-scrubber"
        min={0}
        max={Math.max(0, stacksLength - 1)}
        value={currentIndex}
        onChange={onSeek}
        aria-label="Reading position"
      />
      <div
        className="reader-progress-fill"
        style={{ width: `${progress * 100}%`, transitionDuration: `${transitionMs}ms` }}
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
      {rereReadEndIndex != null && rereReadEndIndex > 0 && stacksLength > 0 && (
        <div
          className="reader-reread-marker"
          style={{ left: markerLeft(rereReadEndIndex) }}
          aria-hidden="true"
        />
      )}
      {stacksLength > 0 && normalBookmarkMarkers.map((bookmark) => (
        <div
          key={bookmark.id}
          className="reader-bookmark-tick"
          style={{ left: markerLeft(bookmark.stackIndex) }}
          title={bookmark.label}
          role="img"
          aria-label={`Bookmark: ${bookmark.label}`}
        />
      ))}
      {goalBookmarkIndex != null && goalBookmarkIndex > 0 && stacksLength > 0 && (
        <div
          className="reader-target-marker"
          style={{ left: markerLeft(goalBookmarkIndex) }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
