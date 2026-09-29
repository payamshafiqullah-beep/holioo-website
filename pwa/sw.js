const VERSION='holioo-ho-icon-v1';
const CORE=["./","./index.html","./styles.css?v=20260929-reorder-v1","./db.js?v=20260929-reorder-v1","./drive.js?v=20260929-reorder-v1","./core.js?v=20260929-reorder-v1","./ui/icons.js?v=20260929-reorder-v1","./ui/components.js?v=20260929-reorder-v1","./ui/reorder.js?v=20260929-reorder-v1","./ui/shell.js?v=20260929-reorder-v1","./features/media-viewer.js?v=20260929-reorder-v1","./features/course-actions.js?v=20260929-reorder-v1","./features/capture-actions.js?v=20260929-reorder-v1","./features/pdf-actions.js?v=20260929-reorder-v1","./features/community-actions.js?v=20260929-reorder-v1","./pages/LoginPage.js?v=20260929-reorder-v1","./pages/AdminPage.js?v=20260929-reorder-v1","./pages/AcademicSetupPage.js?v=20260929-reorder-v1","./pages/HomePage.js?v=20260929-reorder-v1","./pages/CoursesPage.js?v=20260929-reorder-v1","./pages/CourseDetailPage.js?v=20260929-reorder-v1","./pages/SectionPage.js?v=20260929-reorder-v1","./pages/SessionPage.js?v=20260929-reorder-v1","./pages/CapturePage.js?v=20260929-reorder-v1","./pages/CaptureCompletePage.js?v=20260929-reorder-v1","./pages/SplitBatchPage.js?v=20260929-reorder-v1","./pages/OrganizeBatchPage.js?v=20260929-reorder-v1","./pages/InboxPage.js?v=20260929-reorder-v1","./pages/PhotoViewerPage.js?v=20260929-reorder-v1","./pages/PdfBuilderPage.js?v=20260929-reorder-v1","./pages/PdfViewerPage.js?v=20260929-reorder-v1","./pages/FilesPage.js?v=20260929-reorder-v1","./pages/AcademicLibraryPage.js?v=20260929-reorder-v1","./pages/ProfilePage.js?v=20260929-reorder-v1","./pages/SyncPage.js?v=20260929-reorder-v1","./app.js?v=20260929-reorder-v1","./manifest.webmanifest","./icon.svg","./icon-180.png","./icon-192.png","./icon-512.png"];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(VERSION)
      .then(cache=>cache.addAll(CORE))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)));
    await self.clients.claim();

    // Force already-open / installed PWA windows to load the new shell once
    // a new service worker takes control.
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    await Promise.all(clients.map(async client=>{
      try{await client.navigate(client.url)}catch{}
    }));
  })());
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;

  const url=new URL(req.url);
  if(url.hostname.includes('supabase.co')||url.hostname.includes('googleapis.com')||url.hostname.includes('accounts.google.com'))return;

  // Navigation: network first, cached shell only when offline.
  if(req.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(req,{cache:'no-store'});
        const cache=await caches.open(VERSION);
        cache.put('./index.html',fresh.clone()).catch(()=>{});
        return fresh;
      }catch{
        return (await caches.match(req))||(await caches.match('./index.html'));
      }
    })());
    return;
  }

  // JS/CSS: prefer the newest network copy when online, keep cache as fallback.
  if(url.origin===self.location.origin&&(/\.js$/.test(url.pathname)||/\.css$/.test(url.pathname))){
    event.respondWith((async()=>{
      const cache=await caches.open(VERSION);
      try{
        const fresh=await fetch(req,{cache:'no-store'});
        if(fresh?.ok)cache.put(req,fresh.clone()).catch(()=>{});
        return fresh;
      }catch{
        return (await cache.match(req))||(await caches.match(req,{ignoreSearch:true}));
      }
    })());
    return;
  }

  // Icons and other static assets can remain cache-first.
  event.respondWith(
    caches.match(req)
      .then(cached=>cached||fetch(req).then(res=>{
        if(res&&res.ok){
          const copy=res.clone();
          caches.open(VERSION).then(cache=>cache.put(req,copy));
        }
        return res;
      }))
  );
});
