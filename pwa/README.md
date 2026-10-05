# Holioo app (PWA)

The installable study app: capture and organise course photos (CM / TD / TP), build PDFs, notes on tablets and
computers, a library, and sync through the user's own Google Drive. Plain HTML, CSS and JavaScript — no bundler, no
framework: `index.html` loads classic scripts in order.

- **Where things are:** `ARCHITECTURE.md` (folder map, load order, data flow, how to add a feature).
- **Run it:** from the repository root, `npm ci`, then `npm run dev:app` and open the address it prints (the website's landing page is `npm run dev`).
- **Check it:** `npm run check` (lint, formatting, release consistency, syntax, smoke test, all tests).
- **Release it:** bump `release.json` with `node tools/release.mjs <new-release>`, commit, open a pull request. CI checks
  everything, publishes on merge to `main`, then verifies the live files against this folder.
- **Folders:** `core/` shell and saved state · `data/` IndexedDB · `sync/` Google Drive and merging · `ui/` shared
  interface · `features/<name>/` one folder per feature · `styles/` the style sheet, in linking order · `vendor/`
  libraries · `tests/` not published.
