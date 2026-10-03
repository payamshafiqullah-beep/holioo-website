const VIEWS={login:()=>renderLogin(),blocked:()=>renderBlocked(),admin:()=>renderAdmin(),academicSetup:()=>renderAcademicSetup(),home:()=>renderHome(),courses:()=>renderCourses(),course:()=>renderCourse(),section:()=>renderSection(),session:()=>typeof isDesk==='function'&&isDesk()?renderSessionDesk():renderSession(),capture:()=>renderCapture(),scanReview:()=>renderScanReview(),captureComplete:()=>renderCaptureComplete(),split:()=>renderSplit(),organize:()=>renderOrganize(),inbox:()=>renderInbox(),photoViewer:()=>renderPhotoViewer(),pdfBuilder:()=>renderPdfBuilder(),pdfViewer:()=>renderPdfViewer(),files:()=>renderFiles(),library:()=>renderLibrary(),profile:()=>renderProfile(),sync:()=>renderSync(),live:()=>renderLiveCapture()};
async function render(){
  destroyReorderables();
  // Sign-in is mandatory. Offline, the last signed-in account on this device keeps working locally.
  const signedIn=!!currentUser||guestMode||(!navigator.onLine&&!!stateOwner);
  if(accountBlocked)currentView='blocked';
  else if(!signedIn)currentView='login';
  else if(currentView==='login'||currentView==='blocked')currentView='home';
  if(currentView==='admin'&&currentRole!=='admin')currentView='profile';
  if(signedIn&&!state.onboardingComplete&&currentView==='home')currentView='academicSetup';
  setChrome(['login','blocked','academicSetup','photoViewer','pdfViewer','capture','scanReview','admin'].includes(currentView));
  if(typeof flushNoteSaves==='function')flushNoteSaves();
  if(typeof deskSessionCleanup==='function'){deskSessionCleanup();deskSessionCleanup=null}
  if(typeof liveCleanup==='function'){liveCleanup();liveCleanup=null}
  releaseThumbUrls();
  // Changes made on another device are merged here, just before the screen is drawn again.
  if(typeof applyPendingRemote==='function')await applyPendingRemote().catch(e=>console.warn('Remote merge',e));
  await VIEWS[currentView]?.();
  if(typeof syncDesk==='function')syncDesk();
  if(typeof updatePresence==='function')updatePresence();
  applyChromeStatus();
  if(typeof syncQuickCapture==='function')syncQuickCapture();
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e});
window.addEventListener('online',async()=>{offlineBanner.classList.add('hidden');if(!cloudReady){await bootstrapCloud();render()}else{try{driveStatus=await Drive.status(sb,currentUser.id)}catch{}await refreshSyncIndicator();if(state.settings.autoDriveSync)queueSync('online')}});
window.addEventListener('offline',()=>{offlineBanner.classList.remove('hidden');refreshSyncIndicator()});
// The app goes to the background: the notebook's last strokes are saved and copied to Drive.
document.addEventListener('visibilitychange',()=>{if(document.hidden&&typeof flushNotebook==='function')flushNotebook()});
window.addEventListener('focus',async()=>{if(sb&&currentUser&&navigator.onLine){try{driveStatus=await Drive.status(sb,currentUser.id);await refreshSyncIndicator();if(driveStatus.connected&&currentView==='sync')render();if(typeof pullStructureSoon==='function')pullStructureSoon()}catch{}}});
// Back on screen after a while: look at what the account's other devices did (at most once a minute).
let lastPullAt=0;
document.addEventListener('visibilitychange',()=>{
  if(document.hidden||Date.now()-lastPullAt<60000||!driveStatus.connected||!sb||!currentUser)return;
  lastPullAt=Date.now();queueSync('visible');
});
if(!navigator.onLine)offlineBanner.classList.remove('hidden');
// App updates: the new version is installed in the background and loaded only when it can't
// interrupt anything (app in the background, or back on Accueil) — never in the middle of a capture.
function reloadIfSafe(){
  if(!appUpdateReady)return false;
  const busy=currentView==='capture'||(typeof cameraQueue!=='undefined'&&cameraQueue.pending()>0)||!!sheetRoot.innerHTML||syncBusy;
  if(busy)return false;
  location.reload();return true;
}
if('serviceWorker'in navigator){
  const hadController=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!hadController)return;appUpdateReady=true;if(document.hidden)reloadIfSafe()});
  let swReg=null,lastUpdateCheck=Date.now();
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){reloadIfSafe();return}
    // Installed apps can stay open for days: look for a new version at most once an hour.
    if(swReg&&Date.now()-lastUpdateCheck>36e5){lastUpdateCheck=Date.now();swReg.update().catch(()=>{})}
  });
  window.addEventListener('load',async()=>{try{swReg=await navigator.serviceWorker.register('./sw.js');await swReg.update()}catch(e){console.error(e)}});
}

// Photos stored on this device but listed nowhere (e.g. a capture batch opened from Captures and
// never filed, with an older version) come back in Captures instead of staying invisible.
// Skipped when several Google accounts use this device, since a photo's owner can't be known.
async function recoverOrphanPhotos(){
  if(!stateOwner)return; // signed out: nobody to give them to
  try{
    const stored=await DB.keys('photos');if(!stored.length)return;
    const used=new Set(),accounts=new Set();
    const collect=s=>{
      for(const b of s?.inbox||[])for(const id of b.photoIds||[])used.add(id);
      for(const c of s?.courses||[])for(const x of c.sections||[])for(const q of x.sessions||[])for(const id of q.photoIds||[])used.add(id);
      for(const id of s?.captureDraft?.photoIds||[])used.add(id);
      for(const id of Object.keys(s?.sync?.deleted||{}))used.add(id);   // deleted on another device
    };
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(!k||!(k===STORE_KEY||k===LEGACY_KEY||k.startsWith(`${STORE_KEY}:`))||k.includes(':backup-'))continue;
      const owner=k.split(':')[1];if(owner&&owner!==GUEST)accounts.add(owner);
      try{collect(JSON.parse(localStorage.getItem(k)))}catch{}
    }
    collect(state);
    if(accounts.size>1)return;
    if(typeof cameraQueue!=='undefined'&&cameraQueue.pending())return;
    const lost=stored.filter(id=>!used.has(id));if(!lost.length)return;
    const rows=(await Promise.all(lost.map(id=>DB.get('photos',id)))).filter(r=>r?.blob);
    if(!rows.length)return;
    rows.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
    state.inbox.unshift({id:uid(),title:'Photos récupérées',photoIds:rows.map(r=>r.id),createdAt:now()});
    saveState();
  }catch(e){console.warn('Orphan photo check failed',e)}
}

(async()=>{await DB.open();try{await navigator.storage?.persist?.()}catch{}await bootstrapCloud();await recoverOrphanPhotos();await refreshSyncIndicator();await render()})();
