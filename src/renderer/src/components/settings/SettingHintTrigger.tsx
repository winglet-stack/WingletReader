import React, { useCallback, useId, useRef, useState } from 'react'

const SHOW_DELAY_MS = 150

interface Props {
  settingLabel: string
  text: string
}

/** Circled ? control that reveals static setting explain copy on hover or focus. */
export default function SettingHintTrigger({ settingLabel, text }: Props) {
  const tooltipId = useId()
  const [visible, setVisible] = useState(false)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(() => {
    if (showTimerRef.current) clearTimeout(showTimerRef.current)
    showTimerRef.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
  }, [])

  const hide = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
    setVisible(false)
  }, [])

  return (
    <span
      className="settings-help-wrap"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        type="button"
        className="settings-help-trigger"
        aria-label={`Help: ${settingLabel}`}
        aria-describedby={visible ? tooltipId : undefined}
        onFocus={show}
        onBlur={hide}
      >
        <span aria-hidden="true">?</span>
      </button>
      <span
        id={tooltipId}
        role={visible ? 'tooltip' : undefined}
        aria-hidden={visible ? undefined : true}
        className={`settings-help-tooltip${visible ? ' settings-help-tooltip--visible' : ''}`}
      >
        {text}
      </span>
    </span>
  )
}
