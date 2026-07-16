# Building WingletReader

WingletReader builds are **deterministic**: everyone who checks out a given
commit and follows the steps below compiles the same program. Two things make
that real — a pinned toolchain (`.nvmrc` + the `engines` block in
`package.json`) and `npm ci`, which installs the exact transitive versions
recorded in the committed `package-lock.json` rather than re-resolving `^`
ranges. See [ADR-0029](adr/0029-first-official-alpha-hardening.md) for the
rationale.

## Toolchain

| Tool | Pinned line | Source of truth |
| ---- | ----------- | --------------- |
| Node | 24 (`>=24 <25`) | `.nvmrc`, `engines.node` |
| npm  | `>=11` (ships with Node 24) | `engines.npm` |

No native compiler toolchain is required.

## One-command reproducible build (Windows installer)

```bash
nvm use            # select Node 24 (reads .nvmrc)
npm ci             # install exact locked dependencies from package-lock.json
npm run dist:win   # produce the Windows NSIS installer under dist/
```

`nvm use` on Windows requires [nvm-windows](https://github.com/coreybutler/nvm-windows);
if the pinned version isn't installed yet, run `nvm install 24` first. On
platforms with POSIX `nvm`, `nvm use` reads `.nvmrc` directly.

## Everyday development

```bash
npm ci             # first checkout / after a lockfile change
npm run dev        # run the app with hot reload (electron-vite)
npm run build      # production build (no packaging)
npm test           # run the Vitest suite

npm run dist:win       # Windows NSIS installer
npm run dist:portable  # portable, run-in-place copy
```

Use `npm ci` (not `npm install`) for reproducible installs: it fails fast if
`package.json` and `package-lock.json` disagree and never mutates the lockfile.
Reach for `npm install` only when you are intentionally adding or upgrading a
dependency — commit the resulting `package-lock.json` change alongside it.
