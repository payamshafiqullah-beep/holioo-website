'use strict';
// Google Drive sync: what is sent, the sync indicator, queueing and running a sync.
// Besides photos and PDFs, Drive keeps the session notebooks (features/notes/notebook-ink.js), typed notes (features/notes/notes.js)
// and Notes pages (features/notes/canvas-sync.js).
const driveDocuments=()=>{
  const makers=[typeof notebookDriveDocuments==='function'?notebookDriveDocuments:null,typeof notesDriveDocuments==='function'?notesDriveDocuments:null,typeof canvasDriveDocuments==='function'?canvasDriveDocuments:null].filter(Boolean);
  return makers.length?async s=>(await Promise.all(makers.map(m=>m(s)))).flat():null;
};
async function refreshSyncIndicator(){
  let pending=0;try{pending=await Drive.pendingCount(state,DB,driveDocuments())}catch{}
  if(!navigator.onLine)syncIndicator={cls:'offline',text:'Hors ligne'};
  else if(syncBusy)syncIndicator={cls:'pending',text:'Synchronisation…'};
  else if(driveStatus.connected)syncIndicator=pending?{cls:'pending',text:`${pending} élément(s) à synchroniser`}:{cls:'online',text:'Google Drive à jour'};
  else syncIndicator={cls:'',text:'Enregistré sur cet appareil'};
  applyChromeStatus();
}
function queueSync(reason='auto'){clearTimeout(queueSync.t);queueSync.t=setTimeout(()=>runDriveSync(reason),600)}
async function runDriveSync(reason='manual'){
  // A change made during a sync is sent by a second run right after it.
  if(syncBusy){if(navigator.onLine)runDriveSync.again=reason;return}
  if(!navigator.onLine||!sb||!currentUser)return;
  // "Synchroniser automatiquement" off: only an explicit tap syncs.
  if(reason!=='manual'&&!state.settings.autoDriveSync)return;
  syncBusy=true;await refreshSyncIndicator();
  try{
    driveStatus=await Drive.status(sb,currentUser.id);if(!driveStatus.connected){if(reason==='manual')showToast('Connectez Google Drive d’abord');return}
    const result=await Drive.syncAll({sb,user:currentUser,state,db:DB,documents:driveDocuments(),
      save:()=>{saveState.quiet=true;try{saveState()}finally{saveState.quiet=false}},
      onDocument:(d,files)=>{if(typeof notesDocumentSent==='function')notesDocumentSent(d,files);if(typeof canvasDocumentSent==='function')canvasDocumentSent(d,files)},
      onProgress:({checked,total,phase})=>{syncIndicator={cls:'pending',text:`${phase==='pull'?'Réception':'Synchronisation'}… ${checked}/${total}`};applyChromeStatus()}});
    // What the account’s other devices added or removed is now here: show it where that is safe (not in the camera,
    // the photo viewer, a notebook being written in, a form being filled).
    const news=(result.received||0)+(result.changed?1:0);
    if(news&&['home','courses','course','section','gallery','files','inbox','sync','library','profile'].includes(currentView))render();
    if(result.failed){console.warn('Drive sync:',result.lastError);showToast(`${result.failed} élément(s) non synchronisé(s) — nouvel essai plus tard`)}
    else if(result.receivedFailed)showToast(`${result.receivedFailed} élément(s) de vos autres appareils n’ont pas pu être reçus — nouvel essai plus tard`);
    else if(result.received)showToast(`${result.received} élément(s) reçu(s) de vos autres appareils`);
    else if(reason==='manual'||result.synced)showToast(result.synced?`${result.synced} élément(s) synchronisé(s)`:result.changed?'Vos autres appareils sont à jour ici':'Tout est déjà synchronisé');
  }catch(e){console.error(e);syncIndicator={cls:'error',text:'Erreur de synchronisation'};applyChromeStatus();if(e?.code==='DRIVE_FULL')showToast('Google Drive est plein : libérez de l’espace pour continuer la sauvegarde');else if(reason==='manual')showToast(`Sync impossible : ${e.message||e}`)}finally{syncBusy=false;await refreshSyncIndicator();if(currentView==='sync')render();const again=runDriveSync.again;runDriveSync.again=null;if(again)queueSync(again==='manual'?'auto':again)}
}
