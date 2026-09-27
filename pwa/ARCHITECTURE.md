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
- `capture-actions.js` — camera, gallery import, batch helpers
- `pdf-actions.js` — PDF generation helpers
- `community-actions.js` — publish/library/Profile/Drive UI actions
- `media-viewer.js` — shared photo/PDF viewer state and actions

## Services and app shell

- `db.js` — IndexedDB local-first binary storage
- `drive.js` — per-user Google Drive sync
- `core.js` — shared state, Supabase bootstrap, navigation helpers, sync queue
- `app.js` — route dispatcher and lifecycle listeners only
- `styles.css` — shared visual tokens and shared component styling
- `sw.js` — offline PWA cache
- `smoke-test.mjs` — critical flow checks

## Future change rule

1. Change only the page or shared feature involved.
2. Do not recreate the whole project for a small UI change.
3. Keep photos and PDFs in IndexedDB, not localStorage.
4. Keep Google secrets server-side.
5. Schema changes must be backward compatible or versioned.
6. Run syntax checks, smoke tests, and website build before merging to main.
7. The rollback branch created before this work remains `backup-before-figma-final`.
