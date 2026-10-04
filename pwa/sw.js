// Holioo service worker.
// - App files carry ?v=<release>: served from the cache first (instant start, even on bad Wi-Fi);
//   a new release changes the URLs, so nothing stale is ever served.
// - The page itself: network first with a short timeout, cached copy when offline or slow.
// - Libraries (Supabase, jsPDF, pdf.js) and fonts from CDNs: kept in a separate cache that survives
//   releases, so PDF creation and viewing work offline once they were loaded online.
// - A new version installs in the background; the page reloads into it only when that can't
//   interrupt anything (see reloadIfSafe in app.js).
const VERSION='holioo-epure-v15';
const RUNTIME='holioo-cdn-v1';
const CORE=["./", "./index.html", "./icon.svg?v=hq-ho-v3", "./icon-180.png?v=hq-ho-v3", "./styles.css?v=20261004-epure-v23", "./db.js?v=20261004-epure-v23", "./drive.js?v=20261004-epure-v23", "./features/cloud-sync.js?v=20261004-epure-v23", "./sync-signals.js?v=20261004-epure-v23", "./features/state-merge.js?v=20261004-epure-v23", "./features/remote-sync.js?v=20261004-epure-v23", "./features/notes.js?v=20261004-epure-v23", "./ui/desk-shell.js?v=20261004-epure-v23", "./ui/course-navigator.js?v=20261004-epure-v23", "./pages/GalleryDeskPage.js?v=20261004-epure-v23", "./pages/NotesCanvasPage.js?v=20261004-epure-v23", "./pages/LiveCapturePage.js?v=20261004-epure-v23", "./core.js?v=20261004-epure-v23", "./ui/icons.js?v=20261004-epure-v23", "./ui/components.js?v=20261004-epure-v23", "./ui/reorder.js?v=20261004-epure-v23", "./ui/shell.js?v=20261004-epure-v23", "./ui/camera-picker.js?v=20261004-epure-v23", "./ui/radial-menu.js?v=20261004-epure-v23", "./ui/photo-editor.js?v=20261004-epure-v23", "./vendor/qrcode.js?v=20261004-epure-v23", "./vendor/perfect-freehand.js?v=20261004-epure-v23", "./features/media-viewer.js?v=20261004-epure-v23", "./features/course-actions.js?v=20261004-epure-v23", "./features/image-pipeline.js?v=20261004-epure-v23", "./features/photo-edits.js?v=20261004-epure-v23", "./features/thumbs.js?v=20261004-epure-v23", "./features/camera-i18n.js?v=20261004-epure-v23", "./features/camera-destination.js?v=20261004-epure-v23", "./features/gallery-logic.js?v=20261004-epure-v23", "./features/navigator-logic.js?v=20261004-epure-v23", "./features/canvas-doc.js?v=20261004-epure-v23", "./features/pdf-ink.js?v=20261004-epure-v23", "./features/canvas-render.js?v=20261004-epure-v23", "./features/canvas-sync.js?v=20261004-epure-v23", "./features/canvas-export.js?v=20261004-epure-v23", "./features/people.js?v=20261004-epure-v23", "./features/camera-queue.js?v=20261004-epure-v23", "./features/scan-core.js?v=20261004-epure-v23", "./features/scanner.js?v=20261004-epure-v23", "./features/scan-ml.js?v=20261004-epure-v23", "./features/ocr.js?v=20261004-epure-v23", "./features/text-actions.js?v=20261004-epure-v23", "./features/capture-actions.js?v=20261004-epure-v23", "./features/quick-capture.js?v=20261004-epure-v23", "./features/reading-logic.js?v=20261004-epure-v23", "./features/quick-reading.js?v=20261004-epure-v23", "./features/item-menu.js?v=20261004-epure-v23", "./features/pdf-actions.js?v=20261004-epure-v23", "./features/community-actions.js?v=20261004-epure-v23", "./features/notebook-ink.js?v=20261004-epure-v23", "./features/xlsx-export.js?v=20261004-epure-v23", "./features/activity.js?v=20261004-epure-v23", "./pages/LoginPage.js?v=20261004-epure-v23", "./pages/AdminPage.js?v=20261004-epure-v23", "./pages/AcademicSetupPage.js?v=20261004-epure-v23", "./pages/HomePage.js?v=20261004-epure-v23", "./pages/CoursesPage.js?v=20261004-epure-v23", "./pages/CourseDetailPage.js?v=20261004-epure-v23", "./pages/SectionPage.js?v=20261004-epure-v23", "./pages/SessionPage.js?v=20261004-epure-v23", "./pages/CapturePage.js?v=20261004-epure-v23", "./pages/ScanReviewPage.js?v=20261004-epure-v23", "./pages/CaptureCompletePage.js?v=20261004-epure-v23", "./pages/SplitBatchPage.js?v=20261004-epure-v23", "./pages/OrganizeBatchPage.js?v=20261004-epure-v23", "./pages/InboxPage.js?v=20261004-epure-v23", "./pages/PhotoViewerPage.js?v=20261004-epure-v23", "./pages/PdfBuilderPage.js?v=20261004-epure-v23", "./pages/PdfViewerPage.js?v=20261004-epure-v23", "./pages/FilesPage.js?v=20261004-epure-v23", "./pages/AcademicLibraryPage.js?v=20261004-epure-v23", "./pages/ProfilePage.js?v=20261004-epure-v23", "./pages/SyncPage.js?v=20261004-epure-v23", "./pages/PeoplePage.js?v=20261004-epure-v23", "./pages/HolioSharesPage.js?v=20261004-epure-v23", "./pages/SharedViewerPage.js?v=20261004-epure-v23", "./app.js?v=20261004-epure-v23", "./workers/image-worker.js?v=20261004-epure-v23", "./workers/scanner-worker.js?v=20261004-epure-v23", "./features/scan-detect.js?v=20261004-epure-v23", "./features/scan-refine.js?v=20261004-epure-v23", "./manifest.webmanifest"];
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
