import React from 'react'

interface Props {
  darkSrc: string
  lightSrc: string
  alt: string
}

export default function ReaderButtonIcon({ darkSrc, lightSrc, alt }: Props) {
  return (
    <>
      <img
        className="reader-button-icon reader-button-icon--theme-dark"
        src={darkSrc}
        alt=""
        aria-hidden="true"
        title={alt}
      />
      <img
        className="reader-button-icon reader-button-icon--theme-light"
        src={lightSrc}
        alt=""
        aria-hidden="true"
        title={alt}
      />
    </>
  )
}
