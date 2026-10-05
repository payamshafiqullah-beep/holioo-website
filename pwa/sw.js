// Holioo service worker.
// - App files carry ?v=<release>: served from the cache first (instant start, even on bad Wi-Fi);
//   a new release changes the URLs, so nothing stale is ever served.
// - The page itself: network first with a short timeout, cached copy when offline or slow.
// - Libraries (Supabase, jsPDF, pdf.js) and fonts from CDNs: kept in a separate cache that survives
//   releases, so PDF creation and viewing work offline once they were loaded online.
// - A new version installs in the background; the page reloads into it only when that can't
//   interrupt anything (see reloadIfSafe in app.js).
const VERSION='holioo-epure-v24';
const RUNTIME='holioo-cdn-v1';
const CORE=["./", "./index.html", "./icon.svg?v=hq-ho-v3", "./icon-180.png?v=hq-ho-v3", "./styles.css?v=20261004-epure-v41", "./data/db.js?v=20261004-epure-v41", "./sync/drive.js?v=20261004-epure-v41", "./sync/cloud-sync.js?v=20261004-epure-v41", "./sync/sync-signals.js?v=20261004-epure-v41", "./sync/state-merge.js?v=20261004-epure-v41", "./sync/remote-sync.js?v=20261004-epure-v41", "./features/notes/notes.js?v=20261004-epure-v41", "./ui/desk-shell.js?v=20261004-epure-v41", "./features/courses/course-navigator.js?v=20261004-epure-v41", "./features/courses/GalleryDeskPage.js?v=20261004-epure-v41", "./features/notes/NotesCanvasPage.js?v=20261004-epure-v41", "./features/camera/LiveCapturePage.js?v=20261004-epure-v41", "./core/core.js?v=20261004-epure-v41", "./ui/icons.js?v=20261004-epure-v41", "./ui/components.js?v=20261004-epure-v41", "./ui/reorder.js?v=20261004-epure-v41", "./ui/shell.js?v=20261004-epure-v41", "./features/camera/camera-picker.js?v=20261004-epure-v41", "./ui/radial-menu.js?v=20261004-epure-v41", "./features/photos/photo-editor.js?v=20261004-epure-v41", "./vendor/qrcode.js?v=20261004-epure-v41", "./vendor/perfect-freehand.js?v=20261004-epure-v41", "./ui/media-viewer.js?v=20261004-epure-v41", "./features/courses/course-actions.js?v=20261004-epure-v41", "./features/photos/image-pipeline.js?v=20261004-epure-v41", "./features/photos/photo-edits.js?v=20261004-epure-v41", "./features/photos/thumbs.js?v=20261004-epure-v41", "./features/camera/camera-i18n.js?v=20261004-epure-v41", "./features/camera/camera-destination.js?v=20261004-epure-v41", "./features/courses/gallery-logic.js?v=20261004-epure-v41", "./features/courses/navigator-logic.js?v=20261004-epure-v41", "./features/notes/canvas-doc.js?v=20261004-epure-v41", "./features/pdf/pdf-ink.js?v=20261004-epure-v41", "./features/notes/canvas-render.js?v=20261004-epure-v41", "./features/notes/canvas-sync.js?v=20261004-epure-v41", "./features/notes/canvas-export.js?v=20261004-epure-v41", "./features/people/people.js?v=20261004-epure-v41", "./ui/multi-select.js?v=20261004-epure-v41", "./features/camera/camera-queue.js?v=20261004-epure-v41", "./features/scanner/scan-core.js?v=20261004-epure-v41", "./features/scanner/scanner.js?v=20261004-epure-v41", "./features/scanner/scan-ml.js?v=20261004-epure-v41", "./features/scanner/ocr.js?v=20261004-epure-v41", "./features/scanner/text-actions.js?v=20261004-epure-v41", "./features/camera/capture-actions.js?v=20261004-epure-v41", "./features/camera/quick-capture.js?v=20261004-epure-v41", "./features/home/reading-logic.js?v=20261004-epure-v41", "./features/home/quick-reading.js?v=20261004-epure-v41", "./ui/item-menu.js?v=20261004-epure-v41", "./features/pdf/pdf-actions.js?v=20261004-epure-v41", "./features/library/community-actions.js?v=20261004-epure-v41", "./features/notes/notebook-ink.js?v=20261004-epure-v41", "./features/admin/xlsx-export.js?v=20261004-epure-v41", "./features/admin/activity.js?v=20261004-epure-v41", "./features/account/LoginPage.js?v=20261004-epure-v41", "./features/admin/AdminPage.js?v=20261004-epure-v41", "./features/courses/AcademicSetupPage.js?v=20261004-epure-v41", "./features/home/HomePage.js?v=20261004-epure-v41", "./features/courses/CoursesPage.js?v=20261004-epure-v41", "./features/courses/CourseDetailPage.js?v=20261004-epure-v41", "./features/courses/SectionPage.js?v=20261004-epure-v41", "./features/courses/SessionPage.js?v=20261004-epure-v41", "./features/camera/CapturePage.js?v=20261004-epure-v41", "./features/scanner/ScanReviewPage.js?v=20261004-epure-v41", "./features/camera/CaptureCompletePage.js?v=20261004-epure-v41", "./features/inbox/SplitBatchPage.js?v=20261004-epure-v41", "./features/inbox/OrganizeBatchPage.js?v=20261004-epure-v41", "./features/inbox/InboxPage.js?v=20261004-epure-v41", "./features/photos/PhotoViewerPage.js?v=20261004-epure-v41", "./features/pdf/PdfBuilderPage.js?v=20261004-epure-v41", "./features/pdf/PdfViewerPage.js?v=20261004-epure-v41", "./features/files/FilesPage.js?v=20261004-epure-v41", "./features/library/AcademicLibraryPage.js?v=20261004-epure-v41", "./features/account/ProfilePage.js?v=20261004-epure-v41", "./features/account/SyncPage.js?v=20261004-epure-v41", "./features/people/PeoplePage.js?v=20261004-epure-v41", "./features/people/HolioSharesPage.js?v=20261004-epure-v41", "./features/people/MySharedPdfsPage.js?v=20261004-epure-v41", "./features/people/SharedViewerPage.js?v=20261004-epure-v41", "./core/app.js?v=20261004-epure-v41", "./features/photos/image-worker.js?v=20261004-epure-v41", "./features/scanner/scanner-worker.js?v=20261004-epure-v41", "./features/scanner/scan-detect.js?v=20261004-epure-v41", "./features/scanner/scan-refine.js?v=20261004-epure-v41", "./manifest.webmanifest"];
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
