import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');

const pageFiles=[
  './pages/WelcomePage.js','./pages/AcademicSetupPage.js','./pages/HomePage.js','./pages/CoursesPage.js',
  './pages/CourseDetailPage.js','./pages/SectionPage.js','./pages/SessionPage.js','./pages/CapturePage.js',
  './pages/CaptureCompletePage.js','./pages/SplitBatchPage.js','./pages/OrganizeBatchPage.js','./pages/InboxPage.js',
  './pages/PhotoViewerPage.js','./pages/PdfBuilderPage.js','./pages/PdfViewerPage.js','./pages/FilesPage.js',
  './pages/AcademicLibraryPage.js','./pages/ProfilePage.js','./pages/SyncPage.js'
];
const featureFiles=[
  './features/media-viewer.js','./features/course-actions.js','./features/capture-actions.js',
  './features/pdf-actions.js','./features/community-actions.js'
];

const app=[
  read('./core.js'),
  ...featureFiles.map(read),
  ...pageFiles.map(read),
  read('./app.js')
].join('\n');

const drive=read('./drive.js');
const html=read('./index.html');
const sw=read('./sw.js');
const manifest=JSON.parse(read('./manifest.webmanifest'));
if(!html.includes('20260928-pastel-full-v1'))throw new Error('Asset cache-bust version missing');

const required=[
  'Diviser le lot','Organiser les photos','Inbox','Section personnalisée','Nouvelle séance',
  'Créer un PDF','Ma bibliothèque','Rechercher un Holioo ID','Google Drive','Synchroniser automatiquement',
  'movePhotoToSession','renderPdfBuilder','renderSplit','publishSession','openPhotoViewer','renderPhotoViewer',
  'openPdfViewer','renderPdfViewer','Partager','Synchroniser vers Drive','Recadrer','setupPinchZoom','openCropEditor','captureGalleryRail','camera-v3-filmstrip','camera-v3-shutter'
];
for(const s of required)if(!app.includes(s))throw new Error(`Flow missing: ${s}`);
for(const s of ['Prêt(e) à continuer','Mes cours','Réviser rapidement','pastel-feature-card','pastel-main-view'])if(!app.includes(s)&&!read('./styles.css').includes(s))throw new Error(`Pastel UI missing: ${s}`);
if(app.includes('Pincez pour zoomer'))throw new Error('Old pinch zoom hint still present');
if(!app.includes('camera-pastel-thumb'))throw new Error('Modern gallery control missing');

for(const p of [...pageFiles,...featureFiles,'./db.js','./drive.js','./core.js','./app.js','./manifest.webmanifest']){
  const htmlPath=p.replace('./','./');
  if(p.endsWith('.js')&&!html.includes(`src="${htmlPath}`))throw new Error(`HTML dependency missing: ${htmlPath}`);
}

for(const s of ['drive-auth-start','drive-access-token','drive-disconnect','syncAll'])if(!drive.includes(s))throw new Error(`Drive integration missing: ${s}`);
for(const p of [...pageFiles,...featureFiles,'./app.js','./core.js','./db.js','./drive.js'])if(!sw.includes(p))throw new Error(`Offline cache missing: ${p}`);

if(manifest.display!=='standalone'||manifest.scope!=='./')throw new Error('PWA manifest invalid');
if(/GOOGLE_CLIENT_SECRET|SUPABASE_SERVICE_ROLE_KEY/.test(app+drive))throw new Error('Sensitive server secret referenced in frontend');

console.log(`Holioo modular smoke test: PASS (${pageFiles.length} page files)`);

for(const s of ['HOLIOO PASTEL SYSTEM','pastel-brand-header','pastel-course-row','pastel-file-row','camera-pastel-shutter'])if(!read('./styles.css').includes(s))throw new Error(`Pastel style missing: ${s}`);
