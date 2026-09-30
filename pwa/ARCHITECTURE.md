# Holioo PWA architecture

Holioo is organized so a small future change can be made in one place without rebuilding unrelated screens.

## Screen rule

Every visible app screen has its own JavaScript file in `pwa/pages/`.

Examples:
- Home → `pages/HomePage.js`
- Courses → `pages/CoursesPage.js`
- Course detail → `pages/CourseDetailPage.js`
- Session gallery → `pages/SessionPage.js`
- Capture → `pages/CapturePage.js`
- Inbox → `pages/InboxPage.js`
- PDF builder → `pages/PdfBuilderPage.js`
- PDF viewer → `pages/PdfViewerPage.js`
- Library → `pages/AcademicLibraryPage.js`
- Profile → `pages/ProfilePage.js`

If only one screen changes, edit that page file first. Do not rewrite unrelated page files.

## Shared feature logic

Shared behavior that several screens use lives in `pwa/features/`:

- `course-actions.js` — photo reorder, move, delete, session gallery helpers
- `capture-actions.js` — camera, gallery import, batch helpers (`removeFromInbox`: photos leave Captures only once filed)
- `camera-destination.js`, `camera-queue.js`, `camera-i18n.js` — camera destination logic, background save queue, camera texts
- `quick-capture.js`, `../ui/radial-menu.js` — Quick Capture: one continuous gesture on the trigger in the Accueil card (where the illustration was; `HeroCard({aside})`): finger down → ring of courses, drag onto a course → its sections open further out, lift on a section → camera in that section, today's session (or a new one on the first photo); lifting anywhere else cancels. Selection happens only on pointerup; the camera stream is requested inside that pointerup (`prewarmCamera`) and the destination goes in through `navigate('capture',{cameraDest})`. `radial-menu.js` is reusable on any element (`createRadialMenu({trigger, items, onSelect})`; exact geometry + hit testing tested in `tests/radial-menu.test.mjs`); elsewhere in the app: `attachQuickCapture(element)`. Selection effect: a small liquid-glass lens under the finger (`lensPoint` in `radial-menu.js`) that snaps onto the nearest circle within 1.4× its size (name in a pill above, label ×1.2); lifting picks the circle the lens is on. A tap on the trigger leaves the menu open for tap-then-tap. The main camera button in the nav bar and the camera screen are not involved
- `image-pipeline.js`, `photo-edits.js`, `../ui/photo-editor.js`, `../workers/image-worker.js` — the photo editor: non-destructive edits (`edit` on the row, original `blob` kept; `rendered` + `thumb` made in a worker), opened from the photo viewer (Modifier); `photoBlob(row)` is what the viewer, PDF, publishing and Drive use
- `scan-core.js`, `scan-detect.js`, `scanner.js`, `../workers/scanner-worker.js` — document scanner in the camera (modes Photo / Document / Tableau / Livre / Carte / QR): live page detection with OpenCV.js in a worker (loaded on first use), smooth tracking, auto-capture, book split, ID card page, QR (jsQR); each page keeps its original + a crop/filter edit rendered by the image worker
- `ocr.js`, `text-actions.js` — offline text recognition (Tesseract.js, fra+eng) in the background; text in IndexedDB `kv` (`ocr:<photo id>`) for search and searchable PDFs; session image export
- `pdf-actions.js` — PDF export with pdf-lib (loaded on demand): page size, quality, cover, contents, footer, metadata, invisible OCR text layer
- `../pages/ScanReviewPage.js` — review after the camera: reorder, retake, delete with undo, crop, per-page filter with live preview, apply to all
- `thumbs.js` — small stored previews (`thumb`) used by every photo grid; full photos only in the viewer, PDF and Drive
- `pdf-actions.js` — PDF generation helpers
- `community-actions.js` — publish/library/Profile/Drive UI actions
- `media-viewer.js` — shared photo/PDF viewer state and actions

## Services and app shell

- `db.js` — IndexedDB local-first binary storage
- `drive.js` — per-user Google Drive sync
- `core.js` — shared state, Supabase bootstrap, navigation helpers, sync queue
- `app.js` — route dispatcher and lifecycle listeners only
- `styles.css` — shared visual tokens and shared component styling
- `sw.js` — offline cache: versioned app files cache-first, page network-first (3.5 s timeout), CDN libraries/fonts in a cache kept across releases; never reloads open windows (app.js `reloadIfSafe` does, when it can't interrupt a capture)
- `smoke-test.mjs` — critical flow checks
- `tests/` — unit tests (`node --test pwa/tests`, needs `npm ci` for OpenCV.js / pdf-lib / jsQR test copies), run in CI on every pull request; not published; `tests/helpers/scenes.mjs` draws one test photo per scan mode

Release: bump the `?v=` value everywhere in `index.html`, `sw.js` (`CORE` + `VERSION`) and `smoke-test.mjs` together.

## Future change rule

1. Change only the page or shared feature involved.
2. Do not recreate the whole project for a small UI change.
3. Keep photos and PDFs in IndexedDB, not localStorage.
4. Keep Google secrets server-side.
5. Schema changes must be backward compatible or versioned.
6. Run syntax checks, smoke tests, and website build before merging to main.
7. The rollback branch created before this work remains `backup-before-figma-final`.
