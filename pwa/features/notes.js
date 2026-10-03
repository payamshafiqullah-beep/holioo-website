'use strict';
// Typed notes of a séance: one for the séance itself and one beside each photo (tablet / computer layout,
// pages/SessionDeskPage.js and pages/LiveCapturePage.js).
// Stored on the device in IndexedDB `kv` as notes:<séance id>; a copy goes to the séance's Drive folder as
// Notes.json (notesDriveDocuments, through drive.js documents like the Carnet). After it is sent, a `note`
// signal tells the other devices, which read that file from Drive and merge it note by note (newer wins).

const notesKey=sessionId=>`notes:${sessionId}`;
const NOTE_SAVE_MS=800;
const emptyNotes=()=>({version:1,session:{text:'',updatedAt:0},photos:{}});
const noteEntry=e=>({text:typeof e?.text==='string'?e.text:'',updatedAt:Number(e?.updatedAt)||0});
function normalizeNotes(doc){
  const out=emptyNotes();if(!doc||typeof doc!=='object')return out;
  out.session=noteEntry(doc.session);
  for(const[id,e]of Object.entries(doc.photos||{}))out.photos[id]=noteEntry(e);
  return out;
}
// Note by note, the newer one wins (pure; tests/notes.test.mjs).
function mergeNotes(a,b){
  const x=normalizeNotes(a),y=normalizeNotes(b),out=emptyNotes();
  const pick=(p,q)=>(q.updatedAt>p.updatedAt?q:p);
  out.session=pick(x.session,y.session);
  for(const id of new Set([...Object.keys(x.photos),...Object.keys(y.photos)]))out.photos[id]=pick(x.photos[id]||noteEntry(),y.photos[id]||noteEntry());
  return out;
}
const notesVersion=doc=>Math.max(doc.session.updatedAt,...Object.values(doc.photos).map(e=>e.updatedAt),0);
const notesEmpty=doc=>!doc.session.text.trim()&&!Object.values(doc.photos).some(e=>e.text.trim());

async function notesFor(sessionId){
  try{return normalizeNotes((await DB.get('kv',notesKey(sessionId)))?.doc)}catch{return emptyNotes()}
}
const notesListeners=new Set();
function onNotesChanged(fn){notesListeners.add(fn);return()=>notesListeners.delete(fn)}
async function putNotes(sessionId,doc,{remote=false}={}){
  await DB.put('kv',{key:notesKey(sessionId),doc});
  for(const fn of notesListeners)try{fn(sessionId,doc,{remote})}catch(e){console.warn(e)}
}

// Writes are queued per séance so two quick edits never overwrite each other.
const notesWrites=new Map();
function updateNote(sessionId,photoId,text){
  const prev=notesWrites.get(sessionId)||Promise.resolve();
  const job=prev.then(async()=>{
    const doc=await notesFor(sessionId),entry={text,updatedAt:Date.now()};
    if(photoId)doc.photos[photoId]=entry;else doc.session=entry;
    await putNotes(sessionId,doc);
  }).catch(e=>{console.warn(e);showToast('Note non enregistrée')});
  notesWrites.set(sessionId,job);
  job.finally(()=>{if(notesWrites.get(sessionId)===job)notesWrites.delete(sessionId)});
  return job;
}

// A note field: saved 800 ms after the last key, and at once when it loses focus. Grows with its text.
const pendingNoteSaves=new Map();
function flushNoteSaves(){for(const fn of[...pendingNoteSaves.values()])fn()}
function bindNoteField(field,sessionId,photoId=null){
  const key=`${sessionId}:${photoId||''}`;
  let timer=null,last=field.value;
  const grow=()=>{field.style.height='auto';field.style.height=`${field.scrollHeight+2}px`};
  const save=()=>{
    clearTimeout(timer);pendingNoteSaves.delete(key);
    if(field.value===last)return;
    last=field.value;
    updateNote(sessionId,photoId,field.value).then(()=>{if(state.settings.autoDriveSync)queueSync('notes')});
    field.closest('[data-note-state]')?.setAttribute('data-note-state','saved');
  };
  field.addEventListener('input',()=>{
    grow();clearTimeout(timer);pendingNoteSaves.set(key,save);timer=setTimeout(save,NOTE_SAVE_MS);
    field.closest('[data-note-state]')?.setAttribute('data-note-state','editing');
  });
  field.addEventListener('blur',save);
  field.dataset.noteKey=key;
  requestAnimationFrame(grow);
  return{save,setText(text){if(document.activeElement===field)return false;field.value=text;last=text;grow();return true}};
}
// Leaving the screen or the app: what was just typed is saved right away.
document.addEventListener('visibilitychange',()=>{if(document.hidden)flushNoteSaves()});

// ── Drive ──
// One document per séance with notes: Notes.json in the séance's folder.
async function notesDriveDocuments(appState){
  const out=[];
  for(const course of appState.courses||[])for(const section of course.sections||[])for(const session of section.sessions||[]){
    let row=null;try{row=await DB.get('kv',notesKey(session.id))}catch{}
    if(!row?.doc)continue;
    const doc=normalizeNotes(row.doc);
    out.push({id:notesKey(session.id),kind:'notes',sessionId:session.id,version:notesVersion(doc),empty:notesEmpty(doc),
      folder:[course.name,section.name,session.title],parts:()=>notesDriveParts(session,doc)});
  }
  return out;
}
function notesFileJson(session,doc){
  // Photo notes in the séance's photo order; only the notes, so the same notes always give the same file.
  const photos={};
  for(const id of[...(session.photoIds||[]),...Object.keys(doc.photos).sort()])if(doc.photos[id]&&!photos[id])photos[id]=doc.photos[id];
  return JSON.stringify({app:'Holioo',kind:'notes',version:1,session:doc.session,photos});
}
function notesDriveParts(session,doc){
  if(notesEmpty(doc)&&!Object.keys(doc.photos).length&&!doc.session.updatedAt)return[];
  const json=notesFileJson(session,doc);
  return[{name:'Notes.json',sig:syncHash(json),blob:()=>new Blob([json],{type:'application/json'})}];
}
// After a sync sent a séance's notes: tell the other devices where to read them.
function notesDocumentSent(d,files){
  if(d.kind!=='notes'||!files['Notes.json']?.id||typeof sendSyncSignal!=='function')return;
  sendSyncSignal({kind:'note',refId:d.sessionId,driveFileId:files['Notes.json'].id,rev:d.version});
}

// Reads a séance's Notes.json from Drive (given by a signal, or looked up in its folder) and merges it.
const notesPulledMd5=new Map();
async function pullSessionNotes(sessionId,fileId=null){
  if(typeof remoteSyncReady!=='function'||!remoteSyncReady())return false;
  const ctx0=findSessionContext(sessionId);if(!ctx0)return false;
  const{course,section,session}=ctx0;
  const rootYear=state.profile?.academicYear||'Année universitaire';
  const ctx=await Drive.context(sb,currentUser.id);
  let info;
  if(fileId){const m=await Drive.fileMeta(ctx,fileId);if(m.trashed)return false;info={id:m.id,md5:m.md5Checksum||null,parentId:m.parents?.[0]||null}}
  else info=await Drive.findFileAt(ctx,['Holioo',rootYear,course.name,section.name,session.title],'Notes.json');
  if(!info)return false;
  if(info.md5&&notesPulledMd5.get(sessionId)===info.md5)return false;
  let remote=null;try{remote=JSON.parse(await(await Drive.downloadFile(ctx,info.id)).text())}catch{}
  if(remote?.app!=='Holioo'||remote.kind!=='notes')return false;
  const local=await notesFor(sessionId),merged=mergeNotes(local,remote);
  const changed=JSON.stringify(merged)!==JSON.stringify(local);
  if(changed)await putNotes(sessionId,merged,{remote:true});
  // That file is now this device's copy too, as Drive holds it: the next change replaces it in place, and
  // when this device had newer notes the next sync sends them (versions differ).
  const theirs=normalizeNotes(remote);
  await Drive.adoptDocument(DB,{id:notesKey(sessionId),version:notesVersion(theirs),folder:[course.name,section.name,session.title]},rootYear,{'Notes.json':{id:info.id,parentId:info.parentId,sig:syncHash(notesFileJson(session,theirs))}});
  if(notesVersion(merged)!==notesVersion(theirs)&&state.settings.autoDriveSync)queueSync('notes');
  if(info.md5)notesPulledMd5.set(sessionId,info.md5);
  return changed;
}
if(typeof onRemoteSignal==='function')onRemoteSignal(sig=>{if(sig.kind==='note'&&sig.refId)pullSessionNotes(sig.refId,sig.driveFileId).catch(e=>console.warn('Notes pull',e))});

// Files search: séances whose notes match.
async function searchNotes(q){
  q=String(q||'').trim().toLowerCase();if(q.length<2)return[];
  const hits=[];
  for(const course of state.courses)for(const section of course.sections)for(const session of section.sessions){
    let row=null;try{row=await DB.get('kv',notesKey(session.id))}catch{}
    if(!row?.doc)continue;
    const doc=normalizeNotes(row.doc);
    const texts=[doc.session.text,...session.photoIds.map(id=>doc.photos[id]?.text||'')];
    const at=texts.findIndex(t=>t.toLowerCase().includes(q));
    if(at>=0){const t=texts[at],i=t.toLowerCase().indexOf(q);hits.push({course,section,session,photoIndex:at-1,excerpt:t.slice(Math.max(0,i-30),i+q.length+50).replace(/\s+/g,' ')})}
  }
  return hits;
}
