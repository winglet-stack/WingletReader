# Roadmap

WingletReader is built **in public**. This is a living, best-effort roadmap —
not a set of promises or dates. It changes as feedback comes in. The best way to
influence it is to open a thread in
[**Discussions → Ideas**](https://github.com/winglet-stack/WingletReader/discussions/categories/ideas).

> **Status:** first public alpha (`0.2.x-alpha`). Windows-only for now.

## Now — the current alpha

What's shipped and in daily use:

- **Standard Reader** — Stack-based rhythmic playback with live controls
  (speed, words per stack, grid, colours, highlighting, metronome).
- **Library** — texts, categories, contents, search.
- **Import** — `.txt` / `.docx` / `.pdf` / paste, with normalisation on the way in.
- **Bookmarks & reading Targets**, and the **session model**.
- **Make Video** — MP4 export of a text with your Reader settings.
- **Portable USB mode.**
- **Windows installer + auto-update**, reproducible CI builds on tag.
- **Resilience** — error boundary, crash logging, corrupt-store recovery.

## Next — actively being worked on

- **Overlay Reader (read-while-working)** — stream selected text in an
  always-on-top window while you work. In development.
- **In-app feedback sender** — report from inside the app, not just via GitHub.
- **Stabilising the alpha** — acting on bug reports and rough edges from real use.

## Later — planned, not yet started

- **Curated, pre-formatted book bundle** — ready-to-read texts out of the box.
- **Post-reading summary flow** — built, currently disabled; revisit after alpha v1.
- **Code signing** — remove the SmartScreen warning (targeted for beta).
- **Full `fasttrack → WingletReader` internal rename** — a dedicated, tested
  data-migration pass (identifiers are frozen for alpha; the payoff is invisible
  to users today).
- **Opening code contributions** — deliberately, once the license and
  architecture settle (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Beyond alpha

- Graduate `0.2.0-alpha.N` → `-beta.N` → `0.2.0` as the product settles.
- Platforms beyond Windows are not committed — tell us in Discussions if you
  want them.

---

*Have something you'd like moved up, added, or dropped? That's what
[Discussions](https://github.com/winglet-stack/WingletReader/discussions) are
for.*
