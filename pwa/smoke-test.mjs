import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const app=[read('./core.js'),read('./viewer.js'),read('./courses.js'),read('./capture.js'),read('./pdf.js'),read('./community.js'),read('./app.js')].join('\n'),drive=read('./drive.js'),html=read('./index.html'),sw=read('./sw.js');
const manifest=JSON.parse(read('./manifest.webmanifest'));
const required=[
  'Capture rapide','Diviser le lot','Organiser les photos','Inbox','Section personnalisée','Nouvelle séance',
  'Créer un PDF','Bibliothèque académique','Rechercher un Holioo ID','Google Drive','Synchroniser automatiquement',
  'movePhotoToSession','renderPdfBuilder','renderSplit','publishSession','openPhotoViewer','renderPhotoViewer','openPdfViewer','renderPdfViewer','Partager','Synchroniser vers Drive'
];
for(const s of required)if(!app.includes(s))throw new Error(`Flow missing: ${s}`);
for(const s of ['db.js','drive.js','viewer.js','app.js','manifest.webmanifest'])if(!html.includes(s))throw new Error(`HTML dependency missing: ${s}`);
for(const s of ['drive-auth-start','drive-access-token','drive-disconnect','syncAll'])if(!drive.includes(s))throw new Error(`Drive integration missing: ${s}`);
for(const s of ['./app.js','./core.js','./viewer.js','./courses.js','./capture.js','./pdf.js','./community.js','./db.js','./drive.js'])if(!sw.includes(s))throw new Error(`Offline cache missing: ${s}`);
if(manifest.display!=='standalone'||manifest.scope!=='./')throw new Error('PWA manifest invalid');
if(/GOOGLE_CLIENT_SECRET|SUPABASE_SERVICE_ROLE_KEY/.test(app+drive))throw new Error('Sensitive server secret referenced in frontend');
console.log('Holioo smoke test: PASS');
