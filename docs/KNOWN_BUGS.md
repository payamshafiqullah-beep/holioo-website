# Known bugs (not fixed by the structure refactor)

The `refactor-structure` work changes **no behaviour**, so every suspected bug found on the way is written down here
instead of being fixed. Each entry: where, what breaks, why, a suggested fix, and whether it was **confirmed** (read
in the code or reported by a tool) or only **suspected** (needs a device or a second device to reproduce).

Line numbers are those of the code at the start of the refactor (`origin/main` at `6c890da`); after the file moves of
phases 3 and 4 use the function names to find them again.

## Confirmed

### 1. The "Déconnecter Google Drive" button calls a function that does not exist

- `pwa/pages/SyncPage.js:30` (`()=>disconnectDrive()`); the button is created at `SyncPage.js:22`.
- No file defines `disconnectDrive`. Tapping the button throws `ReferenceError` and nothing happens. ESLint reports
  it as `no-undef`.
- Fix: call `Drive.disconnect(sb)` (it exists in `drive.js`), refresh `driveStatus`, then re-render.

### 2. Duplicate key `ready` in the camera texts

- `pwa/features/camera-i18n.js:53`.
- The object literal defines `ready` twice; the later value silently wins, so one of the two messages can never be
  shown. ESLint reports it as `no-dupe-keys`.
- Fix: rename one of the keys (check which message each caller expects).

### 3. PDF viewer leaks listeners on every open and never destroys its ink layer

- `pwa/features/pdf-ink.js:163` and `pwa/pages/PdfViewerPage.js:76-78`, `:90`.
- `leave()` flushes the ink but never calls `ink.destroy()`; `destroy()` runs only when the page is already gone
  before the ink finished loading. Each opening of a PDF leaves two capture-phase `document` listeners
  (`touchend`, `touchcancel`) alive, holding the detached viewer DOM. `leave()` also runs only from the Back button:
  leaving by the bottom navigation or the desk sidebar keeps the `fullscreenchange` listener and the object URL.
- Fix: register a viewer cleanup that `renderOnce` calls (like `canvasCleanup`) and have it call `ink.destroy()`,
  remove the listener and revoke the URL.

### 4. A transient profile-query error is treated as "no profile"

- `pwa/core.js:154-158` (`bootstrapCloud`).
- Only auth-looking errors are handled. Any other `error` (offline blip, 5xx) leaves `profile` as `null`, so a new
  `holiooId` is generated and saved locally, and the `insert` that follows fails on the existing row, unchecked. The
  server keeps the real ID (a trigger protects it) but the device shows a wrong one until the next bootstrap.
- Fix: create a profile only when `!error && !profile`, and check the insert result.

### 5. The service worker cache name is not tied to the release

- `pwa/sw.js:9` (`VERSION`), `:26-32` (`activate`), `:18` (`install`).
- `VERSION` (`holioo-epure-v23`) is a separate counter from the `?v=` token of the files, and has gone backwards in a
  merge before. `activate` only deletes caches whose name differs from `VERSION`, so the old `?v=` files of every
  release stay in the same cache forever. `install` fetches `./` and `./index.html` through the HTTP cache, so it can
  store a stale page shell.
- Fix: derive the cache name from the release token (done by the release stamp of phase 5) and fetch the shell with
  `{cache:'reload'}`.

### 6. Manifest icons are not precached

- `pwa/sw.js:11` (`CORE`): `icon-192.png` and `icon-512.png`, used by `manifest.webmanifest`, are missing from the
  offline cache. Every other file is cached.

### 7. An unknown manifest version is ignored on every sync

- `pwa/drive.js:327`: `if(remote&&remote.v===1)` skips any other version without recording it, so a device running an
  older app downloads the manifest on every sync and never merges it, with no message.
- Fix: store the metadata anyway and tell the user to update the app.

## Suspected

### 8. Two cross-device merge systems run without mutual exclusion

- `pwa/core.js:182` (`runDriveSync`) → `pwa/drive.js` (`syncAll`, `cloudPull`, `cloudPush`, `CloudSync.merge`) and
  `pwa/features/remote-sync.js` (`syncStructure`, `syncMerge`).
- Both merge `state.courses` / `state.inbox`. `remoteSyncChain` serialises only the second one. `applyPendingRemote`
  replaces `state.courses` and `state.inbox` with new objects while `syncAll` still holds `photoContexts(state)` of the
  old ones, so photos can upload under stale names and `CloudSync.merge` can mutate objects that are being replaced.
  The two engines also use different deletion rules (tombstones versus a three-way base).
- Fix: one queue or mutex around both, or retire one engine.

### 9. A deletion made on one device can come back

- `pwa/drive.js:349-362` (`cloudPush`).
- The "has someone written the manifest since I read it?" check and the write are two steps; after `round>=2` it
  overwrites anyway. Device B deletes X and pushes; device A (which has not pulled) pushes with X and overwrites B's
  manifest; B's next pull sees X as new on the other side and restores it.
- Fix: after writing, re-read the manifest and re-merge if it moved.

### 10. Camera race after `video.play()`

- `pwa/features/capture-actions.js:316-321`.
- `camStartToken` is checked before `await video.play()` but not after. If the user leaves, flips the camera or the
  app is backgrounded meanwhile, `cameraStream` / `cameraTrack` are set again after `stopCamera()` ran. The stream is
  already stopped, so its `ended` event never fires: a black preview with no error panel.
- Fix: re-check the token after `play()`; stop the stream and return if it changed.

### 11. A retried camera save can file one photo twice

- `pwa/features/camera-queue.js:49-52`.
- `fileIntoSession` pushes the photo id unconditionally. If anything after it throws before `items.shift()`, the retry
  pushes the same id again.
- Fix: skip the push when the id is already in the list.

### 12. `fetchMissing` workers keep running after a fatal error

- `pwa/drive.js:290-318`.
- A fatal error in one of the three workers rejects `Promise.all`; the others keep changing `cs.pending` after the
  caller moved on, and the final `save?.()` never runs.
- Fix: `allSettled`, or a shared abort flag.

### 13. The download-slot semaphore lets more than three downloads run

- `pwa/features/remote-sync.js:127-131` (`withDownloadSlot`).
- The slot is incremented on release and decremented again when the waiter resumes; a new caller can take it in
  between, so four downloads run and the counter dips below zero.
- Fix: hand the slot to the waiter without incrementing.

## Minor

- `pwa/core.js:162`: `libraryChannel` is never removed on sign-out (a small leak).
- `pwa/core.js:48-52`, `:90`: unreadable local state is backed up under a `backup-<time>` key, then replaced by an
  empty state with no message; nothing in the UI points to the backup.

## Lint notes

`npm run lint` reports a few `no-unused-vars` warnings (for example `pwa/features/media-viewer.js:201`,
`pwa/ui/camera-picker.js:83`, `pwa/features/pdf-actions.js:90`) and `no-useless-escape` /
`no-control-regex` warnings in `pwa/features/people.js:113` and `pwa/features/xlsx-export.js`. None changes
behaviour; they are left as they are.
