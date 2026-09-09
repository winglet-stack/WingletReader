import React, { useState } from 'react'
import AlphaNotice from '../AlphaNotice'
import { alphaChrome } from '../../alphaChrome'

// Result shape mirrors the slice-06 provisioning IPC (typed in env.d.ts). We
// derive it from the bridge so the renderer never drifts from the main contract.
type ProvisionResult = Awaited<ReturnType<typeof window.api.data.createPortableDrive>>

type Phase = 'idle' | 'working' | 'done'

/**
 * Settings → Data "Create Portable Drive" action (ADR-0016 §3, Phase 2). Drives
 * the slice-06 provisioning core: pick a destination folder via the native
 * picker, then assemble a run-in-place portable copy onto it. Progress, the
 * success launcher guidance, and the typed errors are all surfaced inline — a
 * resolved Promise never counts as success, only `result.ok === true`.
 */
export default function PortableDriveSection() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<ProvisionResult | null>(null)

  const run = async () => {
    if (phase === 'working') return

    const target = await window.api.data.selectPortableTarget()
    if (target.canceled || !target.targetPath) return

    setResult(null)
    setPhase('working')
    try {
      const provisioned = await window.api.data.createPortableDrive(target.targetPath)
      setResult(provisioned)
    } catch (err) {
      setResult({
        ok: false,
        error: {
          code: 'copy-failed',
          message: 'The portable copy could not be completed.',
          detail: err instanceof Error ? err.message : String(err)
        }
      })
    } finally {
      setPhase('done')
    }
  }

  return (
    <div className="settings-portable">
      <p className="settings-hint" style={{ marginBottom: '1rem' }}>
        Copy WingletReader and your current library onto a USB stick or folder so you can
        read from it on another Windows PC without installing anything.
      </p>

      <AlphaNotice
        enabled={alphaChrome.portableExperimentalBannerEnabled}
        label="Portable drive experimental warning"
        style={{ marginBottom: '1rem' }}
      >
        {alphaChrome.portableExperimentalBannerCopy}
      </AlphaNotice>

      <button className="btn-secondary" onClick={run} disabled={phase === 'working'}>
        {phase === 'working' ? 'Creating portable drive…' : '⊠ Create Portable Drive…'}
      </button>

      {phase === 'working' && (
        <div className="settings-status settings-status--ok" role="status" aria-live="polite">
          Copying WingletReader and your library to the chosen destination. This can take a
          moment — please don't remove the drive yet.
        </div>
      )}

      {phase === 'done' && result?.ok && (
        <div className="settings-status settings-status--ok" role="status" aria-live="polite">
          <strong>Portable drive ready.</strong>
          <p className="settings-portable-path">{result.targetPath}</p>
          <ol className="settings-portable-steps">
            <li>
              Open that folder and double-click <code>WingletReader.cmd</code> to start
              reading from the stick.
            </li>
            <li>
              The first time on a new PC, Windows may show a one-time SmartScreen warning —
              choose <em>More info</em>, then <em>Run anyway</em>.
            </li>
            <li>Close WingletReader before ejecting the drive so your saves finish.</li>
          </ol>
        </div>
      )}

      {phase === 'done' && result && !result.ok && (
        <div className="settings-status settings-status--error" role="alert">
          <strong>Couldn't create the portable drive.</strong>
          <p className="settings-portable-error">{result.error.message}</p>
          {result.error.detail && (
            <p className="settings-portable-detail">{result.error.detail}</p>
          )}
        </div>
      )}
    </div>
  )
}
