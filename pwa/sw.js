// Holioo service worker.
// - App files carry ?v=<release>: served from the cache first (instant start, even on bad Wi-Fi);
//   a new release changes the URLs, so nothing stale is ever served.
// - The page itself: network first with a short timeout, cached copy when offline or slow.
// - Libraries (Supabase, jsPDF, pdf.js) and fonts from CDNs: kept in a separate cache that survives
//   releases, so PDF creation and viewing work offline once they were loaded online.
// - The release version (pwa/release.json, applied by tools/release.mjs) is the ?v= of every file and names this cache,
//   so installing a release replaces the previous one's files and removes its cache.
// - A new version installs in the background; the page reloads into it only when that can't
//   interrupt anything (see reloadIfSafe in app.js).
const RUNTIME='holioo-cdn-v1';
// release:begin — written by tools/release.mjs from pwa/release.json and pwa/index.html; do not edit by hand
const RELEASE='20261005-epure-v43';
const VERSION=`holioo-${RELEASE}`;
const CORE=["./", "./index.html", "./icon.svg?v=hq-ho-v3", "./icon-180.png?v=hq-ho-v3", "./styles/base.css?v=20261005-epure-v43", "./styles/camera.css?v=20261005-epure-v43", "./styles/viewers.css?v=20261005-epure-v43", "./styles/scanner.css?v=20261005-epure-v43", "./styles/epure-1.css?v=20261005-epure-v43", "./styles/quick-reading.css?v=20261005-epure-v43", "./styles/people.css?v=20261005-epure-v43", "./styles/desk.css?v=20261005-epure-v43", "./styles/dark.css?v=20261005-epure-v43", "./styles/epure-2.css?v=20261005-epure-v43", "./data/db.js?v=20261005-epure-v43", "./sync/drive-api.js?v=20261005-epure-v43", "./sync/drive-items.js?v=20261005-epure-v43", "./sync/drive-cloud.js?v=20261005-epure-v43", "./sync/cloud-sync.js?v=20261005-epure-v43", "./sync/sync-signals.js?v=20261005-epure-v43", "./sync/state-merge.js?v=20261005-epure-v43", "./core/globals.js?v=20261005-epure-v43", "./core/state.js?v=20261005-epure-v43", "./core/navigation.js?v=20261005-epure-v43", "./core/auth.js?v=20261005-epure-v43", "./core/sync-runner.js?v=20261005-epure-v43", "./core/lookups.js?v=20261005-epure-v43", "./ui/icons.js?v=20261005-epure-v43", "./ui/components.js?v=20261005-epure-v43", "./ui/reorder.js?v=20261005-epure-v43", "./ui/shell.js?v=20261005-epure-v43", "./ui/desk-shell.js?v=20261005-epure-v43", "./features/courses/course-navigator.js?v=20261005-epure-v43", "./features/camera/camera-picker.js?v=20261005-epure-v43", "./ui/radial-geometry.js?v=20261005-epure-v43", "./ui/radial-menu.js?v=20261005-epure-v43", "./features/photos/photo-editor.js?v=20261005-epure-v43", "./vendor/perfect-freehand.js?v=20261005-epure-v43", "./vendor/qrcode.js?v=20261005-epure-v43", "./ui/media-viewer.js?v=20261005-epure-v43", "./features/courses/course-actions.js?v=20261005-epure-v43", "./features/photos/image-pipeline.js?v=20261005-epure-v43", "./features/photos/photo-edits.js?v=20261005-epure-v43", "./features/photos/thumbs.js?v=20261005-epure-v43", "./features/camera/camera-i18n.js?v=20261005-epure-v43", "./features/camera/camera-destination.js?v=20261005-epure-v43", "./features/courses/gallery-logic.js?v=20261005-epure-v43", "./features/courses/navigator-logic.js?v=20261005-epure-v43", "./features/camera/camera-queue.js?v=20261005-epure-v43", "./features/scanner/scan-core.js?v=20261005-epure-v43", "./features/scanner/scanner.js?v=20261005-epure-v43", "./features/scanner/scan-ml.js?v=20261005-epure-v43", "./features/scanner/ocr.js?v=20261005-epure-v43", "./features/scanner/text-actions.js?v=20261005-epure-v43", "./features/camera/capture-destination.js?v=20261005-epure-v43", "./features/camera/capture-status.js?v=20261005-epure-v43", "./features/camera/camera-stream.js?v=20261005-epure-v43", "./features/camera/camera-scan-modes.js?v=20261005-epure-v43", "./features/camera/capture-shutter.js?v=20261005-epure-v43", "./features/camera/capture-batch.js?v=20261005-epure-v43", "./features/camera/quick-capture.js?v=20261005-epure-v43", "./features/home/reading-logic.js?v=20261005-epure-v43", "./features/home/quick-reading.js?v=20261005-epure-v43", "./ui/item-menu.js?v=20261005-epure-v43", "./features/pdf/pdf-actions.js?v=20261005-epure-v43", "./features/library/community-actions.js?v=20261005-epure-v43", "./features/notes/notebook-ink.js?v=20261005-epure-v43", "./features/notes/notebook-page.js?v=20261005-epure-v43", "./features/notes/notebook-pointer.js?v=20261005-epure-v43", "./features/notes/notebook-geometry.js?v=20261005-epure-v43", "./features/notes/notebook-canvas.js?v=20261005-epure-v43", "./features/notes/notebook-export.js?v=20261005-epure-v43", "./features/admin/xlsx-export.js?v=20261005-epure-v43", "./features/admin/activity.js?v=20261005-epure-v43", "./sync/remote-sync.js?v=20261005-epure-v43", "./features/notes/notes.js?v=20261005-epure-v43", "./features/notes/canvas-doc.js?v=20261005-epure-v43", "./features/pdf/pdf-ink.js?v=20261005-epure-v43", "./features/notes/canvas-render.js?v=20261005-epure-v43", "./features/notes/canvas-sync.js?v=20261005-epure-v43", "./features/notes/canvas-export.js?v=20261005-epure-v43", "./features/people/people.js?v=20261005-epure-v43", "./features/people/people-shares.js?v=20261005-epure-v43", "./features/people/people-qr.js?v=20261005-epure-v43", "./ui/multi-select.js?v=20261005-epure-v43", "./features/account/LoginPage.js?v=20261005-epure-v43", "./features/admin/AdminPage.js?v=20261005-epure-v43", "./features/courses/AcademicSetupPage.js?v=20261005-epure-v43", "./features/home/HomePage.js?v=20261005-epure-v43", "./features/courses/CoursesPage.js?v=20261005-epure-v43", "./features/courses/CourseDetailPage.js?v=20261005-epure-v43", "./features/courses/SectionPage.js?v=20261005-epure-v43", "./features/courses/SessionPage.js?v=20261005-epure-v43", "./features/courses/GalleryDeskPage.js?v=20261005-epure-v43", "./features/notes/NotesCanvasPage.js?v=20261005-epure-v43", "./features/notes/canvas-dom.js?v=20261005-epure-v43", "./features/notes/canvas-toolbar.js?v=20261005-epure-v43", "./features/notes/canvas-edit.js?v=20261005-epure-v43", "./features/notes/canvas-pointer.js?v=20261005-epure-v43", "./features/notes/canvas-select.js?v=20261005-epure-v43", "./features/notes/canvas-ink.js?v=20261005-epure-v43", "./features/notes/canvas-tray.js?v=20261005-epure-v43", "./features/camera/LiveCapturePage.js?v=20261005-epure-v43", "./features/camera/CapturePage.js?v=20261005-epure-v43", "./features/scanner/ScanReviewPage.js?v=20261005-epure-v43", "./features/camera/CaptureCompletePage.js?v=20261005-epure-v43", "./features/inbox/SplitBatchPage.js?v=20261005-epure-v43", "./features/inbox/OrganizeBatchPage.js?v=20261005-epure-v43", "./features/inbox/InboxPage.js?v=20261005-epure-v43", "./features/photos/PhotoViewerPage.js?v=20261005-epure-v43", "./features/pdf/PdfBuilderPage.js?v=20261005-epure-v43", "./features/pdf/PdfViewerPage.js?v=20261005-epure-v43", "./features/files/FilesPage.js?v=20261005-epure-v43", "./features/library/AcademicLibraryPage.js?v=20261005-epure-v43", "./features/account/ProfilePage.js?v=20261005-epure-v43", "./features/account/SyncPage.js?v=20261005-epure-v43", "./features/people/PeoplePage.js?v=20261005-epure-v43", "./features/people/HolioSharesPage.js?v=20261005-epure-v43", "./features/people/MySharedPdfsPage.js?v=20261005-epure-v43", "./features/people/SharedViewerPage.js?v=20261005-epure-v43", "./core/app.js?v=20261005-epure-v43", "./features/photos/image-worker.js?v=20261005-epure-v43", "./features/scanner/scanner-worker.js?v=20261005-epure-v43", "./features/scanner/scan-detect.js?v=20261005-epure-v43", "./features/scanner/scan-refine.js?v=20261005-epure-v43", "./manifest.webmanifest"];
// release:end
const CDN=["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2", "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js", "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"];
const CDN_HOSTS=['cdn.jsdelivr.net','cdnjs.cloudflare.com','fonts.googleapis.com','fonts.gstatic.com'];
const NAV_TIMEOUT=3500;

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    await (await caches.open(VERSION)).addAll(CORE);
    // Best effort: a CDN hiccup must not block the update.
    const cdn=await caches.open(RUNTIME);
    await Promise.all(CDN.map(async url=>{if(!(await cdn.match(url)))await cdn.add(new Request(url,{mode:'cors'})).catch(()=>{})}));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==VERSION&&k!==RUNTIME).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

const timeout=ms=>new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),ms));

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.hostname.endsWith('supabase.co')||url.hostname.endsWith('googleapis.com')&&url.hostname!=='fonts.googleapis.com'||url.hostname==='accounts.google.com')return;

  // The page: network first, but never wait more than a few seconds for it.
  if(req.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(VERSION);
      const network=fetch(req,{cache:'no-store'}).then(res=>{if(res.ok)cache.put('./index.html',res.clone()).catch(()=>{});return res});
      event.waitUntil(network.catch(()=>{}));
      try{return await Promise.race([network,timeout(NAV_TIMEOUT)])}
      catch{
        const cached=await cache.match('./index.html');
        return cached||network;
      }
    })());
    return;
  }

  if(url.origin===self.location.origin){
    // Versioned app files: cache first.
    if(url.searchParams.has('v')){
      event.respondWith((async()=>{
        const cache=await caches.open(VERSION);
        const cached=await cache.match(req);if(cached)return cached;
        const res=await fetch(req);if(res.ok)cache.put(req,res.clone()).catch(()=>{});
        return res;
      })());
      return;
    }
    // Anything else of ours (manifest, worker scripts…): network first, cache when offline.
    event.respondWith((async()=>{
      const cache=await caches.open(VERSION);
      try{const res=await fetch(req);if(res.ok)cache.put(req,res.clone()).catch(()=>{});return res}
      catch{return(await cache.match(req))||(await cache.match(req,{ignoreSearch:true}))||Response.error()}
    })());
    return;
  }

  // Libraries and fonts: cache first, fetched once.
  if(CDN_HOSTS.includes(url.hostname)){
    event.respondWith((async()=>{
      const cache=await caches.open(RUNTIME);
      const cached=await cache.match(req,{ignoreVary:true});if(cached)return cached;
      const res=await fetch(req);
      if(res.ok||res.type==='opaque')cache.put(req,res.clone()).catch(()=>{});
      return res;
    })());
  }
});
