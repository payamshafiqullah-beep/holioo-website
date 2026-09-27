async function render(){
  avatarBtn.textContent=iconLetter(state.profile.displayName);
  if(!state.onboardingComplete&&currentView==='home')currentView='welcome';
  if(currentView==='welcome')return renderWelcome();if(currentView==='academicSetup')return renderAcademicSetup();if(currentView==='home')return renderHome();if(currentView==='courses')return renderCourses();if(currentView==='course')return renderCourse();if(currentView==='section')return renderSection();if(currentView==='session')return renderSession();if(currentView==='capture')return renderCapture();if(currentView==='captureComplete')return renderCaptureComplete();if(currentView==='split')return renderSplit();if(currentView==='organize')return renderOrganize();if(currentView==='inbox')return renderInbox();if(currentView==='photoViewer')return renderPhotoViewer();if(currentView==='pdfBuilder')return renderPdfBuilder();if(currentView==='pdfViewer')return renderPdfViewer();if(currentView==='files')return renderFiles();if(currentView==='library')return renderLibrary();if(currentView==='profile')return renderProfile();if(currentView==='sync')return renderSync();
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e});
window.addEventListener('online',async()=>{offlineBanner.classList.add('hidden');if(!cloudReady)await bootstrapCloud();else{try{driveStatus=await Drive.status(sb,currentUser.id)}catch{}await refreshSyncIndicator();if(state.settings.autoDriveSync)queueSync('online')}});
window.addEventListener('offline',()=>{offlineBanner.classList.remove('hidden');refreshSyncIndicator()});
window.addEventListener('focus',async()=>{if(sb&&currentUser&&navigator.onLine){try{driveStatus=await Drive.status(sb,currentUser.id);await refreshSyncIndicator();if(driveStatus.connected&&currentView==='sync')render()}catch{}}});
if(!navigator.onLine)offlineBanner.classList.remove('hidden');
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.error));
(async()=>{await DB.open();try{await navigator.storage?.persist?.()}catch{}await bootstrapCloud();await refreshSyncIndicator();await render()})();
