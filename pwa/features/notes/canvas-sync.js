'use strict';
// Notes page ↔ storage, Google Drive and the other devices (same machinery as the typed notes, features/notes/notes.js).
// On the device: IndexedDB `kv` as canvas:<séance id>, written by the page itself 600 ms after the last edit
// (features/notes/NotesCanvasPage.js). Drive: Page.json in the séance's folder, sent through the `documents` of drive.js like
// Notes.json and the Carnet. Once it is sent a `canvas` signal tells the other open devices, which read that file
// and merge it object by object (the newest edit of each wins, features/notes/canvas-doc.js `canvasMerge`); a device
// also reads it when the page is opened. Signals carry ids only, never content.

const canvasFileJson=doc=>JSON.stringify({app:'Holioo',kind:'canvas',version:1,doc});
async function canvasLoadStored(sessionId){
  try{const row=await DB.get('kv',canvasKey(sessionId));return row?.doc?normalizeCanvasDoc(row.doc,sessionId):null}catch{return null}
}
// The page as it is now: the open one (with what is not saved yet), else the stored one.
const canvasDocFor=async sessionId=>canvasRuntime&&canvasRuntime.session.id===sessionId?canvasSerialize(canvasRuntime.store,canvasRuntime.docStamp):canvasLoadStored(sessionId);

async function canvasDriveDocuments(appState){
  const out=[];
  for(const course of appState.courses||[])for(const section of course.sections||[])for(const session of section.sessions||[]){
    const doc=await canvasLoadStored(session.id);if(!doc)continue;
    out.push({id:canvasKey(session.id),kind:'canvas',sessionId:session.id,version:doc.updatedAt,empty:canvasIsEmpty(doc),
      folder:[course.name,section.name,session.title],parts:()=>canvasDriveParts(doc)});
  }
  return out;
}
function canvasDriveParts(doc){
  if(canvasIsEmpty(doc)&&!doc.updatedAt)return[];
  const json=canvasFileJson(doc);
  return[{name:'Page.json',sig:syncHash(json),blob:()=>new Blob([json],{type:'application/json'})}];
}
// After a sync sent a page: tell the other devices where to read it.
function canvasDocumentSent(d,files){
  if(d.kind!=='canvas'||!files['Page.json']?.id||typeof sendSyncSignal!=='function')return;
  sendSyncSignal({kind:'canvas',refId:d.sessionId,driveFileId:files['Page.json'].id,rev:d.version});
}

// Reads a séance's Page.json from Drive (given by a signal, or looked up in its folder) and merges it.
const canvasPulledMd5=new Map();
async function pullSessionCanvas(sessionId,fileId=null){
  if(typeof remoteSyncReady!=='function'||!remoteSyncReady())return false;
  const found=findSessionContext(sessionId);if(!found)return false;
  const{course,section,session}=found,rootYear=state.profile?.academicYear||'Année universitaire';
  const ctx=await Drive.context(sb,currentUser.id);
  let info;
  if(fileId){const m=await Drive.fileMeta(ctx,fileId);if(m.trashed)return false;info={id:m.id,md5:m.md5Checksum||null,parentId:m.parents?.[0]||null}}
  else info=await Drive.findFileAt(ctx,['Holioo',rootYear,course.name,section.name,session.title],'Page.json');
  if(!info)return false;
  if(info.md5&&canvasPulledMd5.get(sessionId)===info.md5)return false;
  let remote=null;try{remote=JSON.parse(await(await Drive.downloadFile(ctx,info.id)).text())}catch{}
  if(remote?.app!=='Holioo'||remote.kind!=='canvas'||!remote.doc)return false;
  const theirs=normalizeCanvasDoc(remote.doc,sessionId),mine=await canvasDocFor(sessionId)||emptyCanvasDoc(sessionId);
  const merged=canvasMerge(mine,theirs);
  const changed=!canvasSameContent(merged,mine);
  // This device had something the file did not: the next sync sends the merged page (its version differs from the file's).
  const extra=!canvasSameContent(merged,theirs);
  if(extra)merged.updatedAt=Math.max(merged.updatedAt,Date.now());
  if(changed){
    if(canvasRuntime?.session.id===sessionId)canvasApplyRemote(canvasRuntime,merged);
    else await DB.put('kv',{key:canvasKey(sessionId),doc:merged});
  }
  // The file is now this device's copy too, as Drive holds it: the next change replaces it in place.
  await Drive.adoptDocument(DB,{id:canvasKey(sessionId),version:theirs.updatedAt,folder:[course.name,section.name,session.title]},rootYear,{'Page.json':{id:info.id,parentId:info.parentId,sig:syncHash(canvasFileJson(theirs))}});
  if(extra&&state.settings.autoDriveSync)queueSync('canvas');
  if(info.md5)canvasPulledMd5.set(sessionId,info.md5);
  return changed;
}
if(typeof onRemoteSignal==='function')onRemoteSignal(sig=>{if(sig.kind==='canvas'&&sig.refId)pullSessionCanvas(sig.refId,sig.driveFileId).catch(e=>console.warn('Canvas pull',e))});

// The page of a deleted séance goes with it (as the Carnet's ink does); its Drive copy stays, like its photos.
async function purgeSessionCanvas(sessionIds){
  if(canvasRuntime&&sessionIds.includes(canvasRuntime.session.id))canvasDiscardRuntime();
  await Promise.all(sessionIds.flatMap(id=>[DB.del('kv',canvasKey(id)),DB.del('kv',`drive:${canvasKey(id)}`)]));
}
