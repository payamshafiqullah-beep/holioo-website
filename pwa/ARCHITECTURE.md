# Holioo PWA architecture

This folder is intentionally feature-based so future changes can be patched without rebuilding the entire app.

## Source of truth

- Product/design source: **Holioo — Final Model** in Figma.
- The code should follow the Figma screen/component structure when Figma read access is available.
- Shared visual tokens live at the top of `styles.css` under `:root`.

## Module ownership

- `db.js` — IndexedDB storage only. Photos/PDF blobs stay local-first here.
- `drive.js` — Google Drive OAuth client calls and Drive file/folder sync only.
- `core.js` — shared app state, routing primitives, Supabase bootstrap, sync queue.
- `viewer.js` — full-screen photo gallery viewer and internal PDF viewer.
- `courses.js` — onboarding, home, courses, sections, sessions, session photo management.
- `capture.js` — camera, gallery import, capture recovery, Inbox, split batch, organize flow.
- `pdf.js` — PDF builder/generation and Files listing.
- `community.js` — academic library, public/private publication, profile, Holioo ID, Drive settings UI.
- `app.js` — route dispatcher and global lifecycle listeners only.
- `sw.js` — PWA offline shell caching.
- `smoke-test.mjs` — static quality gates for critical flows.

## Patch rules

1. Do not rewrite unrelated modules for a local feature request.
2. Gallery changes belong in `viewer.js` plus the smallest calling screen patch.
3. PDF preview/share changes belong in `viewer.js` and `pdf.js`.
4. Camera/Inbox/Split changes belong in `capture.js`.
5. Google Drive changes belong in `drive.js` and, only when needed, the sync UI in `community.js`.
6. Data schema changes must be backward compatible or versioned.
7. Keep binary photos/PDFs out of `localStorage`; use IndexedDB.
8. Never place Google client secret or Supabase service-role key in frontend files.
9. Before merging to `main`, JavaScript syntax + smoke tests must pass.
10. `backup-before-figma-final` is the rollback branch created before the final-model work.

## Media behavior

- Session and batch thumbnails are visible inside Holioo.
- Tapping a photo opens the internal full-screen viewer with swipe and zoom.
- Generated PDFs open inside the Holioo PDF viewer first.
- Sharing is always an explicit user action.
- Google Drive sync is optional and per user.
