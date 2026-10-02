import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');

const pageFiles=[
  './pages/LoginPage.js','./pages/AdminPage.js','./pages/AcademicSetupPage.js','./pages/HomePage.js','./pages/CoursesPage.js',
  './pages/CourseDetailPage.js','./pages/SectionPage.js','./pages/SessionPage.js','./pages/CapturePage.js','./pages/ScanReviewPage.js',
  './pages/CaptureCompletePage.js','./pages/SplitBatchPage.js','./pages/OrganizeBatchPage.js','./pages/InboxPage.js',
  './pages/PhotoViewerPage.js','./pages/PdfBuilderPage.js','./pages/PdfViewerPage.js','./pages/FilesPage.js',
  './pages/AcademicLibraryPage.js','./pages/ProfilePage.js','./pages/SyncPage.js'
];
const uiFiles=['./ui/icons.js','./ui/components.js','./ui/reorder.js','./ui/shell.js','./ui/camera-picker.js','./ui/radial-menu.js','./ui/photo-editor.js'];
const featureFiles=[
  './features/media-viewer.js','./features/course-actions.js','./features/image-pipeline.js','./features/photo-edits.js','./features/thumbs.js','./features/camera-i18n.js','./features/camera-destination.js',
  './features/camera-queue.js','./features/scan-core.js','./features/scanner.js','./features/ocr.js','./features/text-actions.js','./features/capture-actions.js','./features/quick-capture.js','./features/item-menu.js',
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
if(!html.includes('20261002-files-images-v2'))throw new Error('Asset cache-bust version missing');

const required=[
  'Diviser le lot','Organiser les photos','Captures à trier','Section personnalisée','Nouvelle séance',
  'Créer un PDF','Bibliothèque','Rechercher un Holioo ID','Google Drive','Synchroniser automatiquement',
  'movePhotoToSession','renderPdfBuilder','renderSplit','publishSession','openPhotoViewer','renderPhotoViewer',
  'openPdfViewer','renderPdfViewer','Partager','Synchroniser vers Drive','setupPinchZoom','openCameraPicker','resolveCameraDestination','cameraQueue','camDest','cameraStatus','finishCapture','zoomRange','importLocalFiles','toggleFavorite','startGoogleLogin','google-login-exchange','Continuer avec Google','Essayer sans compte','enterGuestMode','makeReorderable','Maintenez une photo','renderAdmin','admin-users','Bloquer l’accès','Supprimer le compte'
];
for(const s of required)if(!app.includes(s))throw new Error(`Flow missing: ${s}`);
// Home, tabs and shared components required by the UI v2 spec.
for(const s of ['Prêt à apprendre aujourd’hui ?','CONTINUER','Reprendre','Mes cours','Révisions du jour','Rechercher un cours...','Rechercher dans la bibliothèque...','Rechercher un fichier...','Cours enregistrés','PDF récents','Notes privées','Sessions partagées','Dossiers','Récents','Exports','mode_photo'])if(!app.includes(s))throw new Error(`UI v2 text missing: ${s}`);
for(const c of ['PageHeader','BottomNav','FloatingCaptureButton','SearchBar','SectionTitle','HeroCard','CourseCard','CategoryCard','ListCard','StatCard','ProgressBar','FilterChips','IconBadge','EmptyState','ActionButton','AvatarButton'])if(!app.includes(`function ${c}(`))throw new Error(`Shared component missing: ${c}`);
for(const l of ['Accueil','Cours','Capture','Bibliothèque','Fichiers'])if(!app.includes(`label:'${l}'`))throw new Error(`Bottom nav item missing: ${l}`);
if(/data-left=|data-right=/.test(app))throw new Error('Old left/right photo arrows still present');
if(app.includes('Pincez pour zoomer'))throw new Error('Old pinch zoom hint still present');
if(!app.includes('gallery-shortcut'))throw new Error('Modern gallery control missing');
// Camera v2: photos go straight to their destination, never into an unfiled draft.
if(/openCropEditor|captureDraft\.photoIds=/.test([read('./features/capture-actions.js'),read('./pages/CapturePage.js')].join(' ')))throw new Error('Old camera draft/crop flow still present');
for(const s of ['Choisir la destination','Nouvelle séance','Emploi du temps','permBlocked','visibilitychange'])if(!app.includes(s))throw new Error(`Camera v2 missing: ${s}`);

for(const p of [...pageFiles,...uiFiles,...featureFiles,'./db.js','./drive.js','./core.js','./app.js','./manifest.webmanifest']){
  const htmlPath=p.replace('./','./');
  if(p.endsWith('.js')&&!html.includes(`src="${htmlPath}`))throw new Error(`HTML dependency missing: ${htmlPath}`);
}

if(app.includes('device-bootstrap'))throw new Error('Anonymous device sign-in must stay retired');
for(const s of ['drive-auth-start','drive-access-token','drive-disconnect','syncAll'])if(!drive.includes(s))throw new Error(`Drive integration missing: ${s}`);
for(const p of [...pageFiles,...uiFiles,...featureFiles,'./app.js','./core.js','./db.js','./drive.js'])if(!sw.includes(p))throw new Error(`Offline cache missing: ${p}`);

if(manifest.display!=='standalone'||manifest.scope!=='./')throw new Error('PWA manifest invalid');
if(/GOOGLE_CLIENT_SECRET|SUPABASE_SERVICE_ROLE_KEY/.test(app+drive))throw new Error('Sensitive server secret referenced in frontend');

// App review (data safety, sync, performance) must not regress.
for(const s of ['removeFromInbox','photoThumbUrl','releaseThumbUrls','recoverOrphanPhotos','reloadIfSafe','backup-'])if(!(app+read('./app.js')).includes(s))throw new Error(`Review fix missing: ${s}`);
if(/state\.inbox=state\.inbox\.filter\(x=>x\.id!==batch\.id\)/.test(app))throw new Error('Opening a Captures batch must not remove it before it is filed');
if(sw.includes('client.navigate'))throw new Error('The service worker must not reload open windows (it can interrupt a capture)');
if(/supabase-js@2"/.test(html))throw new Error('Pin the Supabase library to an exact version');
for(const s of ['pushItem','updateContent','useFolderCache'])if(!drive.includes(s))throw new Error(`Drive sync fix missing: ${s}`);
// Photo editor: one non-destructive editor, opened from the viewer; PDF, publishing and Drive use the edited image.
for(const s of ['openPhotoEditor','savePhotoEdit','viewerEdit','blob:photoBlob(row)','photoBlob(ph)','driveNeedsUpdate'])if(!(app+drive).includes(s))throw new Error(`Photo editor wiring missing: ${s}`);
if(!sw.includes('./workers/image-worker.js?v='))throw new Error('Image worker missing from the offline cache');
if(!read('./styles.css').includes('.pe-stage'))throw new Error('Photo editor styles missing');
// Document scanner: modes, live detection in a worker, review, OCR, searchable PDF with pdf-lib.
for(const s of ['SCAN_MODES','Scanner.start','queueScanCapture','renderScanReview','Ocr.enqueue','buildPdfDocument','setTextRenderingMode','cameraFallbackInput','capture="environment"'])if(!app.includes(s))throw new Error(`Scanner missing: ${s}`);
for(const f of ['./workers/scanner-worker.js','./features/scan-detect.js'])if(!sw.includes(f))throw new Error(`Offline cache missing: ${f}`);
if(html.includes('jspdf'))throw new Error('jsPDF replaced by pdf-lib (loaded on demand)');
console.log(`Holioo modular smoke test: PASS (${pageFiles.length} page files)`);

for(const s of ['HOLIOO UI v2','--bg:#F7F7FB','--accent:#5B67F1','.bottom-nav','.capture-orb','.shutter','.cam-dest','.cam-sheet'])if(!read('./styles.css').includes(s))throw new Error(`UI v2 style missing: ${s}`);
