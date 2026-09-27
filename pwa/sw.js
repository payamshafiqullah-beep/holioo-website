const VERSION='holioo-camera-v2';
const CORE=["./","./index.html","./styles.css","./db.js","./drive.js","./core.js","./features/media-viewer.js","./features/course-actions.js","./features/capture-actions.js","./features/pdf-actions.js","./features/community-actions.js","./pages/WelcomePage.js","./pages/AcademicSetupPage.js","./pages/HomePage.js","./pages/CoursesPage.js","./pages/CourseDetailPage.js","./pages/SectionPage.js","./pages/SessionPage.js","./pages/CapturePage.js","./pages/CaptureCompletePage.js","./pages/SplitBatchPage.js","./pages/OrganizeBatchPage.js","./pages/InboxPage.js","./pages/PhotoViewerPage.js","./pages/PdfBuilderPage.js","./pages/PdfViewerPage.js","./pages/FilesPage.js","./pages/AcademicLibraryPage.js","./pages/ProfilePage.js","./pages/SyncPage.js","./app.js","./manifest.webmanifest","./icon.svg","./icon-180.png","./icon-192.png","./icon-512.png"];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.hostname.includes('supabase.co')||url.hostname.includes('googleapis.com')||url.hostname.includes('accounts.google.com'))return;
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{if(res&&res.ok){const copy=res.clone();caches.open(VERSION).then(c=>c.put(req,copy))}return res}).catch(()=>req.mode==='navigate'?caches.match('./index.html'):undefined)));
});
