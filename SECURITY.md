# Security Policy

WingletReader is in **alpha**. Security reports are welcome and taken seriously.

## Reporting a vulnerability

**Please report privately. Do not open a public issue for a security problem.**

Two private channels:

- **GitHub Security Advisories** — [report a vulnerability](https://github.com/winglet-stack/WingletReader/security/advisories/new)
  (preferred; keeps the report private and threaded).
- **Email** — `wingletsoft@gmail.com` with a subject starting `[security]`.

Please include what you'd need to reproduce it: the app version, your OS, the
steps, and the impact you observed. We'll acknowledge as soon as we can and
coordinate a fix and disclosure timeline with you. Public 0-day filing (opening a
plain issue with exploit details before a fix) is exactly what we're asking you
to avoid.

## Supported versions

Only the **latest alpha** is supported. There are no back-ported security fixes
for older alpha builds — update to the newest release. The app's updater offers
new alpha builds automatically.

## Runtime posture

Some context on the app's threat surface, so you can calibrate a report:

- **Local-first (ADR-0007).** WingletReader is a desktop app that keeps all data
  on your device. The only network traffic in a packaged build is a startup
  update check against a public releases repo; there is no account, telemetry,
  analytics, or crash phone-home. Dev and portable builds skip even the update
  check.
- **Electron hardening.** Renderer windows run with `contextIsolation: true` and
  `nodeIntegration` disabled, every window denies `window.open`
  (`setWindowOpenHandler → deny`), and a strict Content-Security-Policy is
  applied. No remote content is loaded into app windows and there are no native
  addons.
- **Runtime version.** The app tracks a **currently-supported Electron release**
  (Chromium/V8 kept current) rather than pinning an end-of-life runtime. Keeping
  the shell patched is part of the alpha-hardening posture.
- **Unsigned installer.** Alpha builds are not yet code-signed, so Windows
  SmartScreen will warn on first run (see the README's Download note). Signing is
  planned for beta. If you can demonstrate a tampering/supply-chain concern that
  signing would address, we still want to hear it.

Because the app parses untrusted files (`.txt` / `.docx` / `.pdf`) and untrusted
text on import, parsing-path issues (malformed documents causing crashes,
resource exhaustion, or path escapes) are in scope and useful to report.
