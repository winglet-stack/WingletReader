import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CategoryRecord, TextRecord } from '../../types'
import { resolveTextCategoryId } from '../../engine/libraryCategoryPicker'
import { resolveTextSegmentVocabulary } from '../../engine/segmentVocabulary'
import viewContentTileSrc from '../../assets/library-tiles/view-content.png'
import resumeButtonSrc from '../../assets/library-tiles/resume-button.png'
import deleteButtonSrc from '../../assets/library-tiles/delete-button.png'

export type TextCardReadTarget =
  | { kind: 'text'; stackIndex: number; resume: boolean }
  | { kind: 'segment'; segmentId: number; stackIndex: number; resume: boolean }

export interface TextCardProps {
  t: TextRecord
  categories: CategoryRecord[]
  activeId?: number
  onRead: (t: TextRecord, target: TextCardReadTarget) => void | Promise<void>
  onDelete: (id: number) => void
  onSegments: (t: TextRecord) => void
}

export default function TextCard({
  t,
  categories,
  activeId,
  onRead,
  onDelete,
  onSegments,
}: TextCardProps) {
  const segmentVocabulary = resolveTextSegmentVocabulary(t)
  const viewSegmentsLabel = `View ${segmentVocabulary.noun.plural}`
  const resolvedCategoryId = resolveTextCategoryId(t.category_id, categories)
  const isSegmentedBook = (t.segment_count ?? 0) > 0
  const [readLabel, setReadLabel] = useState<'Read' | 'Resume'>('Read')
  const [readBusy, setReadBusy] = useState(false)
  const deleteTimerRef = useRef<number | null>(null)
  const [removing, setRemoving] = useState(false)

  useEffect(() => () => {
    if (deleteTimerRef.current !== null) {
      window.clearTimeout(deleteTimerRef.current)
    }
  }, [])

  const assignedCategory = useMemo(
    () =>
      categories.find((category) => category.id === resolvedCategoryId)
      ?? categories[0],
    [categories, resolvedCategoryId]
  )

  useEffect(() => {
    if (!t.id) {
      setReadLabel('Read')
      return
    }
    let cancelled = false
    const loadResumeState = async () => {
      try {
        if (isSegmentedBook) {
          const target = await window.api.db.getBookResumeTarget(t.id!)
          if (!cancelled) setReadLabel(target?.resume ? 'Resume' : 'Read')
          return
        }
        const position = await window.api.db.getReadingPosition(t.id!)
        if (!cancelled) setReadLabel(position ? 'Resume' : 'Read')
      } catch {
        if (!cancelled) setReadLabel('Read')
      }
    }
    loadResumeState().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isSegmentedBook, t.id])

  const handleRead = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!t.id || readBusy) return
    setReadBusy(true)
    try {
      let readTarget: TextCardReadTarget = { kind: 'text', stackIndex: 0, resume: false }
      if (isSegmentedBook) {
        try {
          const target = await window.api.db.getBookResumeTarget(t.id)
          if (target) {
            readTarget = {
              kind: 'segment',
              segmentId: target.segmentId,
              stackIndex: target.stackIndex,
              resume: target.resume,
            }
          }
        } catch {
          readTarget = { kind: 'text', stackIndex: 0, resume: false }
        }
      } else {
        try {
          const position = await window.api.db.getReadingPosition(t.id)
          readTarget = {
            kind: 'text',
            stackIndex: position?.stackIndex ?? 0,
            resume: Boolean(position),
          }
        } catch {
          readTarget = { kind: 'text', stackIndex: 0, resume: false }
        }
      }
      await onRead(t, readTarget)
    } finally {
      setReadBusy(false)
    }
  }, [isSegmentedBook, onRead, readBusy, t])

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!t.id || removing) return

    setRemoving(true)
    deleteTimerRef.current = window.setTimeout(() => {
      deleteTimerRef.current = null
      onDelete(t.id!)
    }, 150)
  }

  return (
    <li className={`text-card ${t.id === activeId ? 'text-card-active' : ''} ${removing ? 'text-card-removing' : ''}`} role="listitem">
      <div className="text-card-lead">
        <button
          className="text-card-read"
          onClick={handleRead}
          aria-label={`${readLabel} "${t.title}"`}
          disabled={readBusy}
        >
          <img className="text-card-read-icon" src={resumeButtonSrc} alt="" aria-hidden="true" />
        </button>

        <button
          className="text-card-contents"
          onClick={(e) => { e.stopPropagation(); onSegments(t) }}
          aria-label={`${viewSegmentsLabel} for "${t.title}"`}
          title={viewSegmentsLabel}
        >
          <img className="text-card-contents-icon" src={viewContentTileSrc} alt="" aria-hidden="true" />
        </button>
      </div>

      <button
        className="text-card-main"
        onClick={() => onSegments(t)}
        aria-label={`Open contents for "${t.title}"`}
      >
        <span className="text-card-text">
          <span className="text-card-title">{t.title}</span>
          <span className="text-card-meta">
            {(t.word_count ?? 0).toLocaleString()} words
            {(t.segment_count ?? 0) > 0 && <> &middot; {t.segment_count} {segmentVocabulary.noun.plural}</>}
          </span>
        </span>
        {assignedCategory && (
          <span
            className="text-card-category-chip text-card-category-chip-active"
            title={assignedCategory.name}
            aria-label={`Category: ${assignedCategory.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            {assignedCategory.name}
          </span>
        )}
      </button>

      <div className="text-card-trailing">
        <button
          className="text-card-delete"
          onClick={handleDelete}
          aria-label={`Delete "${t.title}"`}
          title="Delete"
          disabled={removing}
        >
          <img className="text-card-delete-icon" src={deleteButtonSrc} alt="" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}
