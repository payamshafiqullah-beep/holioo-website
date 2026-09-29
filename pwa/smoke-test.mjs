import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');

const pageFiles=[
  './pages/WelcomePage.js','./pages/AcademicSetupPage.js','./pages/HomePage.js','./pages/CoursesPage.js',
  './pages/CourseDetailPage.js','./pages/SectionPage.js','./pages/SessionPage.js','./pages/CapturePage.js',
  './pages/CaptureCompletePage.js','./pages/SplitBatchPage.js','./pages/OrganizeBatchPage.js','./pages/InboxPage.js',
  './pages/PhotoViewerPage.js','./pages/PdfBuilderPage.js','./pages/PdfViewerPage.js','./pages/FilesPage.js',
  './pages/AcademicLibraryPage.js','./pages/ProfilePage.js','./pages/SyncPage.js'
];
const uiFiles=['./ui/icons.js','./ui/components.js','./ui/shell.js'];
const featureFiles=[
  './features/media-viewer.js','./features/course-actions.js','./features/capture-actions.js',
  './features/pdf-actions.js','./features/community-actions.js'
];

const app=[
  read('./core.js'),
  ...uiFiles.map(read),
  ...featureFiles.map(read),
  ...pageFiles.map(read),
  read('./app.js')
].join('\n');

const drive=read('./drive.js');
const html=read('./index.html');
const sw=read('./sw.js');
const manifest=JSON.parse(read('./manifest.webmanifest'));
if(!html.includes('20260929-ui-v2'))throw new Error('Asset cache-bust version missing');

const required=[
  'Diviser le lot','Organiser les photos','Captures à trier','Section personnalisée','Nouvelle séance',
  'Créer un PDF','Ma bibliothèque','Rechercher un Holioo ID','Google Drive','Synchroniser automatiquement',
  'movePhotoToSession','renderPdfBuilder','renderSplit','publishSession','openPhotoViewer','renderPhotoViewer',
  'openPdfViewer','renderPdfViewer','Partager','Synchroniser vers Drive','Recadrer','setupPinchZoom','openCropEditor','captureGalleryRail','cameraStatus','finishCapture','zoomRange','importLocalFiles','toggleFavorite'
];
for(const s of required)if(!app.includes(s))throw new Error(`Flow missing: ${s}`);
// Home, tabs and shared components required by the UI v2 spec.
for(const s of ['Prêt à apprendre aujourd’hui ?','CONTINUER','Reprendre','Mes cours','Révisions du jour','Rechercher un cours...','Rechercher dans la bibliothèque...','Rechercher un fichier...','Cours enregistrés','PDF récents','Notes privées','Sessions partagées','Dossiers','Récents','Exports','Archives','PHOTO'])if(!app.includes(s))throw new Error(`UI v2 text missing: ${s}`);
for(const c of ['PageHeader','BottomNav','FloatingCaptureButton','SearchBar','SectionTitle','HeroCard','CourseCard','CategoryCard','ListCard','StatCard','ProgressBar','FilterChips','IconBadge','EmptyState','ActionButton','AvatarButton'])if(!app.includes(`function ${c}(`))throw new Error(`Shared component missing: ${c}`);
for(const l of ['Accueil','Cours','Capture','Bibliothèque','Fichiers'])if(!app.includes(`label:'${l}'`))throw new Error(`Bottom nav item missing: ${l}`);
if(app.includes('Pincez pour zoomer'))throw new Error('Old pinch zoom hint still present');
if(!app.includes('gallery-shortcut'))throw new Error('Modern gallery control missing');

for(const p of [...pageFiles,...uiFiles,...featureFiles,'./db.js','./drive.js','./core.js','./app.js','./manifest.webmanifest']){
  const htmlPath=p.replace('./','./');
  if(p.endsWith('.js')&&!html.includes(`src="${htmlPath}`))throw new Error(`HTML dependency missing: ${htmlPath}`);
}

for(const s of ['drive-auth-start','drive-access-token','drive-disconnect','syncAll'])if(!drive.includes(s))throw new Error(`Drive integration missing: ${s}`);
for(const p of [...pageFiles,...uiFiles,...featureFiles,'./app.js','./core.js','./db.js','./drive.js'])if(!sw.includes(p))throw new Error(`Offline cache missing: ${p}`);

if(manifest.display!=='standalone'||manifest.scope!=='./')throw new Error('PWA manifest invalid');
if(/GOOGLE_CLIENT_SECRET|SUPABASE_SERVICE_ROLE_KEY/.test(app+drive))throw new Error('Sensitive server secret referenced in frontend');

console.log(`Holioo modular smoke test: PASS (${pageFiles.length} page files)`);

for(const s of ['HOLIOO UI v2','--bg:#F7F7FB','--accent:#5B67F1','.bottom-nav','.capture-orb','.shutter','.crop-bar'])if(!read('./styles.css').includes(s))throw new Error(`UI v2 style missing: ${s}`);
