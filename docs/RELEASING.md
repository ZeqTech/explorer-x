# Releasing Explorer X

This guide covers cutting a release, and the one roadmap item that needs credentials only the
maintainer can create: **code signing** and **auto-update**. Nothing here is committed with real
secrets; follow the steps below with your own keys.

## Cutting a release

0. Optional: `./make.sh bump patch` (or `minor`, `major`, or an exact `0.3.0`) sets the version in
   `package.json`, `Cargo.toml`, `tauri.conf.json` and the lockfile, and writes the commits since the
   last release tag to `CHANGELOG.md`, sorted into Added / Changed / Fixed / Removed by their prefixes
   (see "Commit messages" in [CONTRIBUTING.md](../CONTRIBUTING.md)). It commits nothing, so review and
   commit the result.
   `./make.sh changelog` just prints the notes, and `./make.sh win --bump patch` bumps and builds.

1. Commit and push everything you want in the release to `main`, and wait for the **Build**
   workflow to go green (it also warms the cache).
2. Tag **that exact commit** and push the tag:

   ```bash
   git tag v0.2.0 && git push origin v0.2.0
   ```

   A tag is a fixed pointer to one commit. It does not move when you commit again, and an
   existing tag name can't be reused, so every release needs a new version number
   (and the tag must be created *after* your last commit).
3. CI copies the tag's version into `package.json`, `Cargo.toml` and `tauri.conf.json`
   (`scripts/set-version.js`), so the installers are named after the tag, e.g.
   `Explorer X_0.2.0_x64-setup.exe`. To do the same locally: `node scripts/set-version.js 0.2.0`.

4. The Build workflow builds Windows and a universal macOS app and uploads them as artifacts.
   Publishing the GitHub Release is gated on a manual **Run workflow** from the tag
   (see the `release` job in `.github/workflows/build.yml`).

Builds are **unsigned** until you add the credentials below, so Windows SmartScreen and macOS
Gatekeeper warn on first launch.

## Code signing

Signing is configured with environment variables / `tauri.conf.json`; `build.sh` calls
`tauri build`, so anything Tauri reads from the environment works in CI and locally.
Add each value as a GitHub **Actions secret**, then expose it to the build step in
`.github/workflows/build.yml`. (Only pass a variable when its secret exists: Tauri treats an empty
value as "signing requested".)

### Windows

Pick one:

- **SignPath Foundation**: free code signing for open-source projects (apply at signpath.org).
- **Azure Artifact Signing**: set `bundle.windows.signCommand` to
  `artifact-signing-cli -e <endpoint> -a <account> -c <profile> -d "Explorer X" %1`.
- **A certificate you own** (OV/EV): set `bundle.windows.certificateThumbprint`, `digestAlgorithm`
  (`sha256`) and `timestampUrl` in `src-tauri/tauri.conf.json`, with the certificate installed on the runner.

Details: <https://v2.tauri.app/distribute/sign/windows/>

### macOS

Needs an Apple Developer Program membership (a *Developer ID Application* certificate).

| Secret | What it is |
| --- | --- |
| `APPLE_CERTIFICATE` | base64 of your exported `.p12` certificate |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` password |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | notarization with an app-specific password |
| *or* `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH` | notarization with an App Store Connect API key |

The workflow must import the certificate into a temporary keychain before `./build.sh mac`;
the Tauri docs have a complete step: <https://v2.tauri.app/distribute/sign/macos/>

## Auto-update

Tauri's updater downloads a signed bundle from a JSON manifest. The update signature is **separate
from OS code signing**: it proves an update came from you.

1. Generate an updater key pair (keep the private key secret and backed up; losing it means users
   cannot receive updates):

   ```bash
   npm run tauri signer generate -- -w ~/.tauri/explorer-x.key
   ```

2. Add the plugin:

   ```bash
   cargo add tauri-plugin-updater --manifest-path src-tauri/Cargo.toml
   npm install @tauri-apps/plugin-updater
   ```

   Register it in `src-tauri/src/lib.rs` with `.plugin(tauri_plugin_updater::Builder::new().build())`
   and add `"updater:default"` to `src-tauri/capabilities/default.json`.

3. In `src-tauri/tauri.conf.json`:

   ```json
   {
     "bundle": { "createUpdaterArtifacts": true },
     "plugins": {
       "updater": {
         "pubkey": "<contents of the generated .pub file>",
         "endpoints": ["https://github.com/<owner>/<repo>/releases/latest/download/latest.json"]
       }
     }
   }
   ```

4. Add `TAURI_SIGNING_PRIVATE_KEY` (and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) as secrets and pass them
   to the Build step. The build then produces `.sig` files next to each installer.
5. Publish a `latest.json` manifest with the release (the
   [`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action) generates it for you).
6. In `ui/`, call `check()` from `@tauri-apps/plugin-updater` on startup (and from a menu item) and
   show a small "Update available" prompt; `downloadAndInstall()` does the rest.

Details: <https://v2.tauri.app/plugin/updater/>
