const VERSION='holioo-final-v4';
const CORE=['./','./index.html','./styles.css','./db.js','./drive.js','./core.js','./viewer.js','./courses.js','./capture.js','./pdf.js','./community.js','./app.js','./manifest.webmanifest','./icon.svg','./icon-180.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.hostname.includes('supabase.co')||url.hostname.includes('googleapis.com')||url.hostname.includes('accounts.google.com'))return;
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{if(res&&res.ok){const copy=res.clone();caches.open(VERSION).then(c=>c.put(req,copy))}return res}).catch(()=>req.mode==='navigate'?caches.match('./index.html'):undefined)));
});
