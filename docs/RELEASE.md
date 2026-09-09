# Releasing WingletReader

WingletReader's authoritative Windows installer is built by GitHub Actions from
a public `v*` tag. Local packaging is only a development convenience.

## Required GitHub Secret

Add this secret as a **repository Actions secret on the repository the `v*` tag
is pushed to** — the private development trunk `winglet-stack/WingletReader-dev`,
where `master` and the release tags live. A secret stored only on the public
snapshot repo is invisible to the workflow run and the publish step fails with
`GitHub Personal Access Token is not set`:

| Secret | Minimal scope |
| ------ | ------------- |
| `RELEASES_TOKEN` | Fine-grained personal access token with **Contents: read/write** on `winglet-stack/WingletReader-Releases` only |

The release workflow maps `RELEASES_TOKEN` to `GH_TOKEN`, which is the
environment variable electron-builder uses for GitHub publishing.

## Version and Name Convention

The package version is a Semantic Version without a product-name prefix. Use the
same version everywhere and add only the conventional wrapper for each surface:

| Surface | Format | Current release |
| ------- | ------ | --------------- |
| `package.json` / app UI | `MAJOR.MINOR.PATCH-PRERELEASE` | `0.2.1-alpha.1` |
| Git tag | `vVERSION` | `v0.2.1-alpha.1` |
| Release title | `WingletReader VERSION` | `WingletReader 0.2.1-alpha.1` |
| Release branch | `release/VERSION` | `chore/release-0.2.1-alpha-1` (working branch; tags go on `master`) |
| Installer | generated from `WingletReader-${version}-Setup.exe` | `WingletReader-0.2.1-alpha.1-Setup.exe` |

`0.2.1-alpha.1` is the first *published* prerelease for the `0.2.1` target (the
bare `0.2.1-alpha` was built but never distributed). If another alpha is
needed for that same target, use `0.2.1-alpha.2`, then `.3`, and so on; Semantic Versioning orders those after the bare
`alpha` identifier. Use `beta.1` and `rc.1` when the release channel advances,
then remove the prerelease suffix for the stable `0.2.1` release. Never reuse a
published version for different contents.

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
   `0.2.1-alpha.1`.
2. Run the local pre-flight:

   ```bash
   npm ci
   npm test
   npm run build
   npm run dist:win
   ```

3. Create and push the matching public tag:

   ```bash
   git tag v0.2.1-alpha.1
   git push origin v0.2.1-alpha.1
   ```

4. Watch `.github/workflows/release.yml` on GitHub Actions. The tag path runs
   `npm ci`, blocking `npm test`, then `npm run dist:win -- --publish always`.
5. Verify the GitHub Release in
   `winglet-stack/WingletReader-Releases` is marked **Pre-release** and contains
   the Windows installer, `latest.yml`, and the blockmap.
6. Verify updater consumption from an older installed alpha. The app's updater
   allows prereleases, so an older packaged alpha should detect the new
   `0.2.1-alpha.1` release and update in place.

Do not publish releases from a developer machine. If the tag pipeline fails,
delete or supersede the failed release assets in `WingletReader-Releases`, fix
the public repo, and push a new alpha tag.
