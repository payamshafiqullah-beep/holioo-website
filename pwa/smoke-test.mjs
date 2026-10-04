import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');

const pageFiles=[
  './pages/LoginPage.js','./pages/AdminPage.js','./pages/AcademicSetupPage.js','./pages/HomePage.js','./pages/CoursesPage.js',
  './pages/CourseDetailPage.js','./pages/SectionPage.js','./pages/SessionPage.js','./pages/GalleryDeskPage.js','./pages/NotesCanvasPage.js','./pages/LiveCapturePage.js','./pages/CapturePage.js','./pages/ScanReviewPage.js',
  './pages/CaptureCompletePage.js','./pages/SplitBatchPage.js','./pages/OrganizeBatchPage.js','./pages/InboxPage.js',
  './pages/PhotoViewerPage.js','./pages/PdfBuilderPage.js','./pages/PdfViewerPage.js','./pages/FilesPage.js',
  './pages/AcademicLibraryPage.js','./pages/ProfilePage.js','./pages/SyncPage.js','./pages/PeoplePage.js','./pages/HolioSharesPage.js','./pages/SharedViewerPage.js'
];
const uiFiles=['./ui/icons.js','./ui/components.js','./ui/reorder.js','./ui/shell.js','./ui/desk-shell.js','./ui/course-navigator.js','./ui/camera-picker.js','./ui/radial-menu.js','./ui/photo-editor.js'];
const featureFiles=[
  './features/media-viewer.js','./features/course-actions.js','./features/image-pipeline.js','./features/photo-edits.js','./features/thumbs.js','./features/camera-i18n.js','./features/camera-destination.js','./features/gallery-logic.js','./features/navigator-logic.js','./features/canvas-doc.js','./features/pdf-ink.js','./features/canvas-render.js','./features/canvas-sync.js','./features/canvas-export.js',
  './features/camera-queue.js','./features/scan-core.js','./features/scanner.js','./features/scan-ml.js','./features/ocr.js','./features/text-actions.js','./features/capture-actions.js','./features/quick-capture.js','./features/item-menu.js',
  './features/pdf-actions.js','./features/cloud-sync.js','./features/community-actions.js','./features/state-merge.js','./features/remote-sync.js','./features/notes.js','./features/people.js','./features/reading-logic.js','./features/quick-reading.js'
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
if(!html.includes('20261004-epure-v21'))throw new Error('Asset cache-bust version missing');

const required=[
  'Diviser le lot','Organiser les photos','Captures à trier','Section personnalisée','Nouvelle séance',
  'Créer un PDF','Bibliothèque','Rechercher un Holioo ID','Google Drive','Synchroniser automatiquement',
  'movePhotoToSession','renderPdfBuilder','renderSplit','publishSession','openPhotoViewer','renderPhotoViewer',
  'openPdfViewer','renderPdfViewer','Partager','Synchroniser vers Drive','setupPinchZoom','openCameraPicker','resolveCameraDestination','cameraQueue','camDest','cameraStatus','finishCapture','zoomRange','importLocalFiles','toggleFavorite','startGoogleLogin','google-login-exchange','Continuer avec Google','Essayer sans compte','enterGuestMode','makeReorderable','Maintenez une photo','renderAdmin','admin-users','Bloquer l’accès','Supprimer le compte'
];
for(const s of required)if(!app.includes(s))throw new Error(`Flow missing: ${s}`);
// Home, tabs and shared components required by the UI v2 spec.
for(const s of ['Prêt à apprendre aujourd’hui ?','Reprendre','Mes cours','Révisions du jour','Rechercher un cours...','Rechercher dans la bibliothèque...','Rechercher un fichier...','Cours enregistrés','PDF récents','Notes privées','Sessions partagées','Dossiers','Récents','Exports','mode_photo'])if(!app.includes(s))throw new Error(`UI v2 text missing: ${s}`);
for(const c of ['PageHeader','BottomNav','FloatingCaptureButton','SearchBar','SectionTitle','HeroCard','CourseCard','CategoryCard','ListCard','StatCard','ProgressBar','FilterChips','IconBadge','EmptyState','ActionButton','AvatarButton'])if(!app.includes(`function ${c}(`))throw new Error(`Shared component missing: ${c}`);
for(const l of ['Accueil','Cours','Capture','Bibliothèque','Fichiers'])if(!app.includes(`label:'${l}'`))throw new Error(`Bottom nav item missing: ${l}`);
if(/data-left=|data-right=/.test(app))throw new Error('Old left/right photo arrows still present');
if(app.includes('Pincez pour zoomer'))throw new Error('Old pinch zoom hint still present');
if(!app.includes('gallery-shortcut'))throw new Error('Modern gallery control missing');
// Camera v2: photos go straight to their destination, never into an unfiled draft.
if(/openCropEditor|captureDraft\.photoIds=/.test([read('./features/capture-actions.js'),read('./pages/CapturePage.js')].join(' ')))throw new Error('Old camera draft/crop flow still present');
for(const s of ['Choisir la destination','Nouvelle séance','Emploi du temps','permBlocked','visibilitychange'])if(!app.includes(s))throw new Error(`Camera v2 missing: ${s}`);

for(const p of [...pageFiles,...uiFiles,...featureFiles,'./db.js','./drive.js','./sync-signals.js','./core.js','./app.js','./manifest.webmanifest']){
  const htmlPath=p.replace('./','./');
  if(p.endsWith('.js')&&!html.includes(`src="${htmlPath}`))throw new Error(`HTML dependency missing: ${htmlPath}`);
}

if(app.includes('device-bootstrap'))throw new Error('Anonymous device sign-in must stay retired');
for(const s of ['drive-auth-start','drive-access-token','drive-disconnect','syncAll'])if(!drive.includes(s))throw new Error(`Drive integration missing: ${s}`);
for(const p of [...pageFiles,...uiFiles,...featureFiles,'./app.js','./core.js','./db.js','./drive.js','./sync-signals.js'])if(!sw.includes(p))throw new Error(`Offline cache missing: ${p}`);

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
// Cross-device sync: structure in the user's Drive, Supabase only for signals (ids, never content).
for(const s of ['syncStructure','applyPendingRemote','ensurePhotoLocal','syncStamp','syncMerge','startSyncSignals'])if(!app.includes(s))throw new Error(`Cross-device sync missing: ${s}`);
for(const s of ['readState','writeState','downloadFile','forgetToken'])if(!drive.includes(s))throw new Error(`Drive state sync missing: ${s}`);
if(html.indexOf('features/state-merge.js')>html.indexOf('src="./core.js'))throw new Error('state-merge.js must load before core.js (saveState stamps from the first save)');
if(/from\('sync_signals'\)\.insert\(\{[^}]*(title|name|text|blob)/.test(read('./sync-signals.js')))throw new Error('Sync signals must carry ids only');
// People + Holioo Shares: exact-ID lookup through one RPC, private connections, view-only shares in a private bucket.
{const people=read('./features/people.js'),mig=fs.readFileSync(new URL('../supabase/migrations/20261004120000_people_and_shares.sql',import.meta.url),'utf8');
for(const s of ['find_holioo_person','loadPeople','addPerson','removePerson','shareWithPeople','revokeShare','loadReceivedShares','copyHoliooId'])if(!people.includes(s))throw new Error(`People feature missing: ${s}`);
if(/from\('profiles'\)/.test(people+read('./pages/PeoplePage.js')+read('./pages/HolioSharesPage.js')))throw new Error('People screens must never read the private profiles table');
if(/\.from\('public_profiles'\)\.select\([^)]*email/.test(people))throw new Error('Public profiles carry no e-mail');
if(!read('./pages/ProfilePage.js').includes('data-nav="people"')||!read('./pages/AcademicLibraryPage.js').includes('holiooSharesBtn'))throw new Error('People entry / Holioo Shares icon missing');
for(const f of ['./pages/FilesPage.js','./pages/PdfViewerPage.js','./pages/SessionPage.js'])if(!/sharePdfWithPeople|shareSessionWithPeople/.test(read(f)))throw new Error(`Share with Holioo people missing in ${f}`);
for(const f of ['./pages/FilesPage.js','./pages/PdfViewerPage.js'])if(!read(f).includes('sharePdf(meta,row)'))throw new Error(`Existing PDF share removed in ${f}`);
for(const f of ['./pages/SessionPage.js'])if(!read(f).includes('exportSessionImages'))throw new Error(`Existing export removed in ${f}`);
if(/create table if not exists public\.public_profiles \([^;]*email/i.test(mig))throw new Error('public_profiles must not hold an e-mail');
for(const s of ["('shared-items', 'shared-items', false","shares_insert_owner","shared_items_select","connections_select_own"])if(!mig.includes(s))throw new Error(`Migration missing: ${s}`);
if(/grant\s+(select|insert|update|delete)[^;]*\bto\s+anon/i.test(mig))throw new Error('No anonymous access to people / shares');
if(/for update/i.test(mig.split('shares_delete')[0].split('create table if not exists public.shares')[1]||''))throw new Error('A share is never updated');
{const mig2=fs.readFileSync(new URL('../supabase/migrations/20261004130000_people_polish.sql',import.meta.url),'utf8'),verify=fs.readFileSync(new URL('../supabase/verify/people_shares_check.sql',import.meta.url),'utf8');
for(const s of ['blockPerson','unblockPerson','loadBlocked','refreshSharesBadge','markSharesSeen','openMyQrSheet','captureAddLink','consumePendingAdd','peopleErrorText','peopleSkeleton','initialsOf'])if(!people.includes(s))throw new Error(`People polish missing: ${s}`);
for(const s of ['create table if not exists public.blocks','blocked_by','rate_limited','private.lookup_log','interval \'1 minute\''])if(!mig2.includes(s))throw new Error(`Polish migration missing: ${s}`);
if(!/\nrollback;/i.test(verify))throw new Error('The real-database check must end with ROLLBACK');
if(/\bcommit\s*;/i.test(verify))throw new Error('The real-database check must never COMMIT');
if(!read('./pages/PeoplePage.js').includes('pplQrBtn')||!read('./pages/HolioSharesPage.js').includes('markSharesSeen')||!read('./pages/AcademicLibraryPage.js').includes('refreshSharesBadge'))throw new Error('QR / unread badge wiring missing');
if(!sw.includes('./vendor/qrcode.js')||!html.includes('vendor/qrcode.js'))throw new Error('QR generator must be loaded and cached offline');
if(/https?:\/\/[^'"]*qr[^'"]*\.(png|svg)|api\.qrserver|chart\.googleapis/i.test(people))throw new Error('The QR code is drawn locally: no third-party QR service');}
for(const f of ['./pages/PeoplePage.js','./pages/HolioSharesPage.js','./pages/SharedViewerPage.js','./features/people.js'])if(!sw.includes(f.slice(1)))throw new Error(`Offline cache missing: ${f}`);}
// Lecture rapide: the Accueil reading shortcut is the paper-page trigger of a 4-ring stacked radial menu; Capture rapide stays 2 rings.
{const home=read('./pages/HomePage.js'),rd=read('./features/quick-reading.js'),radial=read('./ui/radial-menu.js'),css=read('./styles.css');
if(home.includes('Relire mes PDF')||!home.includes('QuickReadingTrigger')||!home.includes('attachQuickReading'))throw new Error('Accueil must use the Lecture rapide trigger in place of "Relire mes PDF"');
for(const s of ['quickReadingItems','quickReadingSelect','maxDepth:4,stack:true','openPdfViewer(item.pdfId,\'home\')','readingTree','qr-page'])if(!rd.includes(s))throw new Error(`Lecture rapide missing: ${s}`);
for(const s of ['radialHitN','radialRadius','applyStack','maxDepth'])if(!radial.includes(s))throw new Error(`Radial menu missing: ${s}`);
if(/maxDepth|stack:/.test(read('./features/quick-capture.js')+read('./features/item-menu.js')))throw new Error('Capture rapide / item menus must keep the plain two-ring menu');
for(const s of ['.radial.open .radial-item.blurred','.radial.open .radial-item.gone','.qr-ring','.qr-resume'])if(!css.includes(s))throw new Error(`Lecture rapide style missing: ${s}`);
if(html.indexOf('features/reading-logic.js')>html.indexOf('features/quick-reading.js')||html.indexOf('features/quick-reading.js')<html.indexOf('features/quick-capture.js'))throw new Error('reading-logic.js, then quick-reading.js, must load after quick-capture.js');}
// Tablet / computer layout: built only at ≥768px, phones keep their own DOM; typed notes beside the photos.
{const desk=read('./ui/desk-shell.js'),css=read('./styles.css');
if(!desk.includes("matchMedia('(min-width:768px)')"))throw new Error('Desk layout must start at 768px');
if(/bottomNav\.innerHTML|NAV_ITEMS\s*=/.test(desk))throw new Error('The desk layout must not touch the phone navigation');
for(const s of ['bindNoteField','notesDriveDocuments','pullSessionNotes','syncDesk'])if(!app.includes(s))throw new Error(`Desk / notes missing: ${s}`);
const deskCss=css.slice(css.indexOf('TABLET & COMPUTER'));
if(!deskCss||/@media\s*\((?!min-width:768px)/.test(deskCss.replace(/@media \(prefers-reduced-motion:reduce\)/g,'')))throw new Error('Desk styles must stay under @media (min-width:768px)');}
// Live Capture: the phone uploads each photo at once only while a tablet listens (presence), then signals it.
for(const s of ['renderLiveCapture','onPhotoStoredForLive','receiveRemotePhoto','updatePresence','liveListeners'])if(!app.includes(s))throw new Error(`Live Capture missing: ${s}`);
if(!read('./features/camera-queue.js').includes('onPhotoStoredForLive'))throw new Error('Camera queue must hand stored photos to Live Capture');
// Galerie + Notes page (tablet / computer): never on phones, scoped styles, model + sync + PDF wired, signal migration shipped.
{const css=read('./styles.css'),deskCss=css.slice(css.indexOf('TABLET & COMPUTER'));
for(const s of ['renderGallery','galleryEntries','galleryMoveInList','Note rapide','renderNotesCanvas','canvasMerge','canvasDriveDocuments','canvasDocumentSent','pullSessionCanvas','exportCanvasPdf','canvasRenderSheet','canvasTopBarHtml','deskNotes','deskPdf','deskSync'])if(!app.includes(s))throw new Error(`Galerie / Notes missing: ${s}`);
if(!read('./pages/GalleryDeskPage.js').includes("if(!isDesk()){navigate('courses')"))throw new Error('Phones must never reach the Galerie');
if(!read('./pages/NotesCanvasPage.js').includes("if(!isDesk()){navigate('home')"))throw new Error('Phones must never reach the Notes page');
for(const s of['.gallery-fab','.gallery-grid','.cv-sheet','.cv-tray','.cv-tools','.cnav-tree','.desk-crumb','.desk-menu'])if(!deskCss.includes(s))throw new Error(`Desk style missing (or outside the desk block): ${s}`);
for(const s of['.gallery-fab','.cv-sheet','.cv-tray','.cnav-tree','.crumb-list'])if(css.slice(0,css.indexOf('TABLET & COMPUTER')).includes(s))throw new Error(`${s} must only exist in the tablet / computer block`);
for(const f of['features/canvas-doc.js','features/canvas-render.js','features/canvas-sync.js','features/canvas-export.js','features/gallery-logic.js','pages/GalleryDeskPage.js','pages/NotesCanvasPage.js'])if(!html.includes(`src="./${f}`))throw new Error(`HTML dependency missing: ${f}`);
if(html.indexOf('features/canvas-doc.js')>html.indexOf('features/canvas-sync.js')||html.indexOf('features/remote-sync.js')>html.indexOf('features/canvas-sync.js'))throw new Error('canvas-sync.js needs canvas-doc.js and remote-sync.js loaded before it');
if(!fs.existsSync(new URL('../supabase/migrations/20261003120000_sync_signals_canvas.sql',import.meta.url)))throw new Error('The canvas signal needs its migration');
if(/\(\?<[=!]/.test(read('./features/canvas-doc.js')+read('./features/canvas-render.js')+read('./pages/NotesCanvasPage.js')))throw new Error('No regex look-behind: iPads before Safari 16.4 could not load the file');
// The phone's own nav and builder are untouched: the Notes option exists only when the desk layout is on.
if(!read('./pages/PdfBuilderPage.js').includes("typeof isDesk==='function'&&isDesk()"))throw new Error('The PDF builder must offer Notes pages on tablet / computer only');}
// Course navigator (tablet / computer): ONE shared tree + breadcrumb on every desk screen, Notes included; the old course
// list, tree, CM / TD / TP pills and the Notes séance selector are gone. Phones keep their own course / section pages.
{const desk=read('./ui/desk-shell.js'),css=read('./styles.css'),deskCss=css.slice(css.indexOf('TABLET & COMPUTER'));
for(const s of['CourseNavigatorTree','navigatorMount','navigatorSelect','navigatorAddSession','navigatorAddCourse','PageBreadcrumb','navTargetView','navCourseTap','navPickSession','navBreadcrumb','DESK_REDIRECT'])if(!app.includes(s))throw new Error(`Course navigator missing: ${s}`);
for(const s of['navigatorMount','PageBreadcrumb','deskSideToggle'])if(!desk.includes(s))throw new Error(`The desk shell must use the course navigator: ${s}`);
for(const s of['DeskTree','DeskCourses','DeskPills','deskFillTree','deskNewSession','deskNewCourse','cvSession','data-gallery-filter','galleryFilterLabel'])if(app.includes(s))throw new Error(`Old course selector still present: ${s}`);
if(/\.(desk-(pill|tree|node|link|filter|scrim|sessions)|cv-session)\b/.test(css))throw new Error('Styles of the old course selectors must be removed');
for(const f of['pages/GalleryDeskPage.js','pages/NotesCanvasPage.js'])if(!read(`./${f}`).includes('navResolve'))throw new Error(`${f} must follow the navigator's selection`);
if(!html.includes('ui/course-navigator.js')||!html.includes('features/navigator-logic.js'))throw new Error('Course navigator files missing from the HTML');
if(html.indexOf('features/navigator-logic.js')>html.indexOf('pages/LoginPage.js'))throw new Error('navigator-logic.js must load before the pages');
if(!deskCss.includes('.cnav-add')||!deskCss.includes('.cnav-dot'))throw new Error('Navigator styles must live in the desk block');
if(css.slice(0,css.indexOf('TABLET & COMPUTER')).includes('.cnav-'))throw new Error('Navigator styles must only exist in the tablet / computer block');}
console.log(`Holioo modular smoke test: PASS (${pageFiles.length} page files)`);

for(const s of ['HOLIOO UI v2','--bg:#F7F7FB','--accent:#5B67F1','.bottom-nav','.capture-orb','.shutter','.cam-dest','.cam-sheet'])if(!read('./styles.css').includes(s))throw new Error(`UI v2 style missing: ${s}`);
