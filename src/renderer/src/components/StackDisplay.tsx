import type { WordStack } from '../types'

export default function StackDisplay({
  stack,
  fontSize,
  isHeadline,
  textOverflow = false,
}: {
  stack: WordStack
  /** Resolved slot font size from the reader frame — headline scaling already applied. */
  fontSize: number
  isHeadline: boolean
  /** When true, applies white-space:nowrap + text-overflow:ellipsis to prevent
   *  text from wrapping and expanding the slot height when it can't fit at minFontSize. */
  textOverflow?: boolean
}) {
  const text = stack.words.join(' ')

  if (isHeadline) {
    return (
      <div
        className={`stack-headline${textOverflow ? ' stack-headline--overflow' : ''}`}
        style={{ fontSize }}
      >
        <div className="headline-rule" />
        <span>{text}</span>
        <div className="headline-rule" />
      </div>
    )
  }

  return (
    <div
      className={`stack-words${textOverflow ? ' stack-words--overflow' : ''}`}
      style={{ fontSize }}
    >
      {text}
    </div>
  )
}
