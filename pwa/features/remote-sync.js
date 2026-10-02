'use strict';
// Same account, same data on every device. The course structure (courses → sections → séances → photo ids,
// Captures batches) is shared through the user's Drive as Holioo/.holioo/state.json, merged by
// features/state-merge.js; photos made on another device are downloaded from Drive when first needed.
// A Supabase signal (sync-signals.js) tells the other open devices to look, right away: ids only, no content.
//
// Order of a sync (runDriveSync, core.js): read + merge state.json → upload photos / PDFs / notebooks →
// write state.json if this device has something new → signal. A remote change is applied to `state` only at
// the start of a render (render() rebuilds every screen from `state`), so a screen never keeps editing objects
// that the merge replaced; while the camera, an editor, a sheet or a text field is in use it waits.

const remoteSyncKey=name=>`sync:${name}:${stateOwner}`;
let remoteSyncChain=Promise.resolve();
let remotePendingDoc=null;
let remotePhotos=null;               // photo id → Drive file id, from state.json and photo signals
let remotePhotosOwner=null;
const remoteSignalListeners=new Set();

const remoteSyncReady=()=>!guestMode&&!!sb&&!!currentUser&&navigator.onLine&&!!driveStatus?.connected;
const remoteDocSig=doc=>{
  const photos={};for(const k of Object.keys(doc?.photos||{}).sort())photos[k]=doc.photos[k];
  return syncHash(JSON.stringify({...syncSharedPart(doc),photos}));
};
async function remoteMeta(){try{return(await DB.get('kv',remoteSyncKey('state')))?.meta||{}}catch{return{}}}
const saveRemoteMeta=meta=>DB.put('kv',{key:remoteSyncKey('state'),meta}).catch(()=>{});

async function loadRemotePhotos(){
  if(remotePhotos&&remotePhotosOwner===stateOwner)return remotePhotos;
  remotePhotosOwner=stateOwner;
  try{remotePhotos=(await DB.get('kv',remoteSyncKey('photos')))?.map||{}}catch{remotePhotos={}}
  return remotePhotos;
}
const saveRemotePhotos=()=>DB.put('kv',{key:remoteSyncKey('photos'),map:remotePhotos||{}}).catch(()=>{});

function statePhotoIds(src=state){
  const ids=[];
  for(const b of src.inbox||[])ids.push(...(b.photoIds||[]));
  for(const c of src.courses||[])for(const x of c.sections||[])for(const q of x.sessions||[])ids.push(...(q.photoIds||[]));
  return ids;
}
async function buildStateDoc(){
  const map=await loadRemotePhotos(),photos={};
  for(const id of new Set(statePhotoIds())){
    let f=null;try{f=(await DB.get('photos',id))?.driveFileId||null}catch{}
    f??=map[id];if(f)photos[id]=f;
  }
  return{app:'Holioo',kind:'state',version:1,...syncSharedPart(state),photos};
}

// Pull (and push) the shared structure. Calls are queued, never run twice at once.
function syncStructure({push=true}={}){
  const run=remoteSyncChain.then(()=>syncStructureNow(push));
  remoteSyncChain=run.catch(()=>{});
  return run;
}
async function syncStructureNow(push){
  if(!remoteSyncReady())return false;
  const ctx=await Drive.context(sb,currentUser.id);
  const meta=await remoteMeta();
  const remote=await Drive.readState(ctx,meta);
  meta.id=remote.id;meta.md5=remote.md5;
  if(!remote.id)meta.sig=null;
  let incoming=false;
  if(remote.data?.app==='Holioo'&&remote.data.kind==='state'){
    meta.sig=remoteDocSig(remote.data);
    remotePendingDoc={doc:remote.data,firstJoin:!meta.joined};
    meta.joined=true;incoming=true;
  }
  // Never write over Drive before what it holds has been merged here.
  if(push&&!remotePendingDoc&&(meta.joined||!remote.id)){
    const doc=await buildStateDoc(),sig=remoteDocSig(doc);
    if(sig!==meta.sig){
      const w=await Drive.writeState(ctx,doc,meta);
      Object.assign(meta,{id:w.id,md5:w.md5,sig,joined:true});
      sendSyncSignal({kind:'state',driveFileId:w.id,rev:Date.now()});
    }
  }
  await saveRemoteMeta(meta);
  if(incoming)renderWhenIdle();
  return incoming;
}

// A remote change waits while something is being used, then the screen is drawn again (which applies it).
function remoteRenderBlocked(){
  if(['capture','scanReview','photoViewer','pdfBuilder','academicSetup'].includes(currentView))return true;
  if(sheetRoot.innerHTML)return true;
  if(document.querySelector('.radial,.photo-editor'))return true;
  const a=document.activeElement;
  return!!a&&(a.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
}
function renderWhenIdle(){
  clearTimeout(renderWhenIdle.t);
  if(remoteRenderBlocked()){renderWhenIdle.t=setTimeout(renderWhenIdle,2000);return}
  render().catch(e=>console.error(e));
}

// Called by render() before drawing: merges what came from another device into `state`.
async function applyPendingRemote(){
  const p=remotePendingDoc;if(!p)return false;
  remotePendingDoc=null;
  const map=await loadRemotePhotos();
  for(const[id,f]of Object.entries(p.doc.photos||{}))if(typeof f==='string')map[id]=f;
  const before=JSON.stringify(syncSharedPart(state));
  const merged=syncMerge(state,p.doc,{firstJoin:p.firstJoin});
  const changed=JSON.stringify(syncSharedPart(merged))!==before;
  if(changed){
    const hadDeleted=state.sync?.deleted||{};
    const gone=Object.keys(merged.sync.deleted).filter(id=>!hadDeleted[id]);
    state.courses=merged.courses;state.inbox=merged.inbox;state.sync={...(state.sync||{}),...merged.sync};
    state.courses.forEach(ensureDefaultSections);
    saveState({remote:true});
    // Deleted on another device: the copy on this one goes too (Drive keeps its own copy).
    const keep=new Set(statePhotoIds());
    for(const id of gone){if(keep.has(id))continue;delete map[id];try{if(await DB.get('photos',id))await DB.del('photos',id)}catch{}}
  }
  await saveRemotePhotos();
  // Something only this device had: send the merged result back.
  if(remoteDocSig({...syncSharedPart(state),photos:p.doc.photos||{}})!==remoteDocSig(p.doc))queueSync('state');
  prefetchRemotePhotos();
  return changed;
}

// ── Photos made on another device ──
const photoDownloads=new Map();
let photoDownloadSlots=3;const photoDownloadWaiters=[];
async function withDownloadSlot(fn){
  if(photoDownloadSlots<=0)await new Promise(r=>photoDownloadWaiters.push(r));
  photoDownloadSlots--;
  try{return await fn()}finally{photoDownloadSlots++;photoDownloadWaiters.shift()?.()}
}
// Resolves true when the photo is on this device (downloading it from Drive if needed).
function ensurePhotoLocal(id){
  if(photoDownloads.has(id))return photoDownloads.get(id);
  const job=(async()=>{
    if(await DB.get('photos',id))return true;
    const fileId=(await loadRemotePhotos())[id];
    if(!fileId||!remoteSyncReady())return false;
    return withDownloadSlot(async()=>{
      if(await DB.get('photos',id))return true;
      const ctx=await Drive.context(sb,currentUser.id);
      const blob=await Drive.downloadFile(ctx,fileId);
      if(await DB.get('photos',id))return true;
      await DB.put('photos',{id,blob:blob.type?blob:new Blob([blob],{type:'image/jpeg'}),createdAt:now(),syncState:'synced',driveFileId:fileId,syncedAt:now()});
      return true;
    });
  })().catch(e=>{console.warn('Photo download failed',id,e);return false}).finally(()=>photoDownloads.delete(id));
  photoDownloads.set(id,job);
  return job;
}
async function prefetchRemotePhotos(){
  const map=await loadRemotePhotos();
  const missing=[];
  for(const id of new Set(statePhotoIds()))if(map[id]&&!(await DB.get('photos',id).catch(()=>null)))missing.push(id);
  if(!missing.length)return;
  const got=await Promise.all(missing.map(ensurePhotoLocal));
  if(got.some(Boolean)&&['home','courses','course','section','session','inbox'].includes(currentView))renderWhenIdle();
}

// ── Signals ──
function sendSyncSignal(fields){
  if(!window.HoliooSignals||!sb||!currentUser)return;
  window.HoliooSignals.send(sb,fields).catch(e=>console.warn('Sync signal not sent',e?.message||e));
}
function onSyncSignal(sig){
  if(sig.kind==='state'){clearTimeout(onSyncSignal.t);onSyncSignal.t=setTimeout(()=>syncStructure({push:false}).catch(e=>console.warn(e)),300)}
  if(sig.kind==='photo'){const got=receiveRemotePhoto(sig).catch(e=>{console.warn('Live photo',e);return false});for(const fn of remoteSignalListeners)try{fn(sig,got)}catch(e){console.warn(e)}return}
  for(const fn of remoteSignalListeners)try{fn(sig)}catch(e){console.warn(e)}
}
function onRemoteSignal(fn){remoteSignalListeners.add(fn);return()=>remoteSignalListeners.delete(fn)}
function startSyncSignals(){if(window.HoliooSignals&&!guestMode&&sb&&currentUser){window.HoliooSignals.start(sb,currentUser.id,onSyncSignal);updatePresence()}}
// What this device tells the others (after every render): tablet / computer layout, on Live Capture, which séance.
function updatePresence(){
  if(!window.HoliooSignals)return;
  const live=currentView==='live';
  const p={desk:typeof isDesk==='function'&&isDesk(),live,sessionId:live&&typeof liveSessionId!=='undefined'?liveSessionId:null};
  const key=JSON.stringify(p);if(key===updatePresence.key)return;
  updatePresence.key=key;window.HoliooSignals.track(p);
}
function stopRemoteSync(){window.HoliooSignals?.stop();Drive.forgetToken?.();remotePendingDoc=null;remotePhotos=null}
// Back on the app: look for changes made elsewhere (at most every 20 s).
function pullStructureSoon(){
  if(Date.now()-(pullStructureSoon.at||0)<20000)return;
  pullStructureSoon.at=Date.now();
  syncStructure({push:false}).catch(e=>console.warn(e));
}

// ── Live Capture (pages/LiveCapturePage.js) ──
// A tablet / computer on the Live screen says so through presence. While one does, each photo stored by the
// camera here is sent to Drive at once (not when the camera is left) and signalled with its séance, so it
// appears there within seconds. With nobody listening, the camera keeps its usual deferred sync.
const isUuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const liveListeners=()=>(window.HoliooSignals?.peers()||[]).filter(p=>p.live);
let liveUploadChain=Promise.resolve();
function onPhotoStoredForLive(id){
  if(!remoteSyncReady()||!liveListeners().length)return null;
  const job=liveUploadChain.then(async()=>{
    const driveFileId=await Drive.pushPhoto({sb,user:currentUser,state,db:DB,id});
    if(!driveFileId)return null;
    const ctx=findSessionContext(liveSessionOf(id));
    sendSyncSignal({kind:'photo',refId:isUuid(id)?id:null,sessionId:isUuid(ctx?.session.id)?ctx.session.id:null,driveFileId,rev:Date.now()});
    // The séance may be new, and its photo list changed: the structure follows shortly.
    clearTimeout(onPhotoStoredForLive.t);
    onPhotoStoredForLive.t=setTimeout(()=>syncStructure({push:true}).catch(e=>console.warn('Live structure',e)),1500);
    return driveFileId;
  }).catch(e=>{console.warn('Live upload failed',e);return null});
  liveUploadChain=job;
  return job;
}
function liveSessionOf(photoId){
  for(const c of state.courses)for(const s of c.sections)for(const q of s.sessions)if(q.photoIds.includes(photoId))return q.id;
  return null;
}
// A photo signal from another device: its Drive file is remembered, a retake replaces the copy here.
async function receiveRemotePhoto(sig){
  if(!sig.refId||!sig.driveFileId)return false;
  const map=await loadRemotePhotos();map[sig.refId]=sig.driveFileId;await saveRemotePhotos();
  const row=await DB.get('photos',sig.refId).catch(()=>null);
  if(row&&row.syncState==='synced'&&row.driveFileId===sig.driveFileId&&!row.edit&&Number(sig.rev)>Date.parse(row.syncedAt||0))await DB.del('photos',sig.refId);
  return ensurePhotoLocal(sig.refId);
}
