const VIEWS={welcome:()=>renderWelcome(),academicSetup:()=>renderAcademicSetup(),home:()=>renderHome(),courses:()=>renderCourses(),course:()=>renderCourse(),section:()=>renderSection(),session:()=>renderSession(),capture:()=>renderCapture(),captureComplete:()=>renderCaptureComplete(),split:()=>renderSplit(),organize:()=>renderOrganize(),inbox:()=>renderInbox(),photoViewer:()=>renderPhotoViewer(),pdfBuilder:()=>renderPdfBuilder(),pdfViewer:()=>renderPdfViewer(),files:()=>renderFiles(),library:()=>renderLibrary(),profile:()=>renderProfile(),sync:()=>renderSync()};
async function render(){
  if(!state.onboardingComplete&&currentView==='home')currentView='welcome';
  await VIEWS[currentView]?.();
  applyChromeStatus();
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e});
window.addEventListener('online',async()=>{offlineBanner.classList.add('hidden');if(!cloudReady)await bootstrapCloud();else{try{driveStatus=await Drive.status(sb,currentUser.id)}catch{}await refreshSyncIndicator();if(state.settings.autoDriveSync)queueSync('online')}});
window.addEventListener('offline',()=>{offlineBanner.classList.remove('hidden');refreshSyncIndicator()});
window.addEventListener('focus',async()=>{if(sb&&currentUser&&navigator.onLine){try{driveStatus=await Drive.status(sb,currentUser.id);await refreshSyncIndicator();if(driveStatus.connected&&currentView==='sync')render()}catch{}}});
if(!navigator.onLine)offlineBanner.classList.remove('hidden');
if('serviceWorker'in navigator)window.addEventListener('load',async()=>{try{const reg=await navigator.serviceWorker.register('./sw.js');await reg.update()}catch(e){console.error(e)}});
(async()=>{await DB.open();try{await navigator.storage?.persist?.()}catch{}await bootstrapCloud();await refreshSyncIndicator();await render()})();
