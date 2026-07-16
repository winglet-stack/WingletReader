# Releasing WingletReader

WingletReader's authoritative Windows installer is built by GitHub Actions from
a public `v*` tag. Local packaging is only a development convenience.

## Required GitHub Secret

Add this secret to the public `winglet-stack/WingletReader` repository:

| Secret | Minimal scope |
| ------ | ------------- |
| `RELEASES_TOKEN` | Fine-grained personal access token with **Contents: read/write** on `winglet-stack/WingletReader-Releases` only |

The release workflow maps `RELEASES_TOKEN` to `GH_TOKEN`, which is the
environment variable electron-builder uses for GitHub publishing.

## Dry Run

Before cutting a release, run the `Release` workflow manually with
`workflow_dispatch`. The manual path runs:

```bash
npm ci
npm test
npm run dist:win -- --publish never
```

The test step is blocking. If the suite is red, no installer is built. The dry
run uploads the installer, `latest.yml`, and blockmap as workflow artifacts so
the packaging output can be inspected without publishing a GitHub Release.

## Release Ritual

1. Confirm the target version in `package.json`, for example
   `0.2.0-alpha.1`.
2. Run the local pre-flight:

   ```bash
   npm ci
   npm test
   npm run build
   npm run dist:win
   ```

3. Create and push the matching public tag:

   ```bash
   git tag v0.2.0-alpha.1
   git push origin v0.2.0-alpha.1
   ```

4. Watch `.github/workflows/release.yml` on GitHub Actions. The tag path runs
   `npm ci`, blocking `npm test`, then `npm run dist:win -- --publish always`.
5. Verify the GitHub Release in
   `winglet-stack/WingletReader-Releases` is marked **Pre-release** and contains
   the Windows installer, `latest.yml`, and the blockmap.
6. Verify updater consumption from an older installed alpha. The app's updater
   allows prereleases, so a packaged `0.1.x-alpha.N` build should detect the new
   `0.2.0-alpha.1` release and update in place.

Do not publish releases from a developer machine. If the tag pipeline fails,
delete or supersede the failed release assets in `WingletReader-Releases`, fix
the public repo, and push a new alpha tag.
