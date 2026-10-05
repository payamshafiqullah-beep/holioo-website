// Same account on two devices (sync/remote-sync.js + state-merge.js + drive.js) against one simulated Drive:
// what one device does appears on the other, photos are fetched from Drive, nothing is lost or duplicated.
// Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fakeDrive,fakeDb} from './helpers/fake-drive.mjs';

const src=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const sbStub={functions:{invoke:async()=>({data:{access_token:'token',expires_in:3600}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{connected:true}})})})})};
const plain=x=>JSON.parse(JSON.stringify(x));

function device(drive,clock,courses){
  const db=fakeDb(),storage=new Map(),sent=[],peers=[];
  const window={HoliooSignals:{send:async(_sb,f)=>{sent.push(f)},start(){},stop(){},track(){},peers:()=>peers}};
  const ctx=vm.createContext({window,fetch:drive.fetch,Headers,Blob,Response,TextEncoder,URL,URLSearchParams,console,crypto,structuredClone,
    navigator:{onLine:true},setTimeout,clearTimeout,clock,DB:db,sbStub,
    localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}});
  vm.runInContext(src('../sync/drive.js'),ctx);
  vm.runInContext(src('../sync/state-merge.js'),ctx);
  vm.runInContext(`
    const Drive=window.HoliooDrive;
    var state={profile:{academicYear:'2026–2027'},courses:${JSON.stringify(courses)},inbox:[],files:[],settings:{autoDriveSync:true}};
    var stateOwner='u1',guestMode=false,sb=sbStub,currentUser={id:'u1'},driveStatus={connected:true},currentView='courses';
    var sheetRoot={innerHTML:''},document={querySelector:()=>null,activeElement:null,addEventListener(){}};
    function showToast(){}
    function findSessionContext(id){for(const course of state.courses)for(const section of course.sections)for(const session of section.sessions)if(session.id===id)return{course,section,session};return null}
    let syncBaseline=null,renders=0,queued=[];
    function saveState(o={}){if(o.remote)syncBaseline=syncFlatten(state);else{const r=syncStamp(state,syncBaseline,++clock.t);syncBaseline=r.flat}}
    function ensureDefaultSections(){}
    const now=()=>new Date().toISOString();
    let renderChain=Promise.resolve();
    function render(){return renderChain=renderChain.then(()=>{renders++;return applyPendingRemote()})}
    function queueSync(r){queued.push(r)}
    async function fullSync(){await syncStructure({push:false});await render();await Drive.syncAll({sb,user:currentUser,state,db:DB,documents:notesDriveDocuments,onDocument:notesDocumentSent});await syncStructure({push:true})}
    saveState();
  `,ctx);
  vm.runInContext(src('../sync/remote-sync.js'),ctx);
  vm.runInContext(src('../features/notes/notes.js'),ctx);
  const run=code=>vm.runInContext(code,ctx);
  return{db,sent,peers,run,ctx,
    state:()=>plain(run('state')),
    edit:fn=>{fn(run('state'));run('saveState()')},
    sync:()=>run('fullSync()'),
    pull:async()=>{await run('syncStructure({push:false})');await run('render()')}};
}
const course=(id,name,sessions=[])=>({id,name,defaultSectionsSeeded:true,sections:[{id:`${id}-cm`,name:'CM',type:'CM',sortOrder:0,sessions}]});
const photo=(db,id)=>db.stores.photos.set(id,{id,blob:new Blob([`jpeg-${id}`],{type:'image/jpeg'}),syncState:'pending'});
const P1='11111111-aaaa-4aaa-8aaa-000000000001',P2='11111111-aaaa-4aaa-8aaa-000000000002';

function setup(){
  const drive=fakeDrive(),clock={t:100};
  const phone=device(drive,clock,[course('c1','Analyse',[{id:'s1',number:1,title:'CM 1',photoIds:[P1,P2]}])]);
  photo(phone.db,P1);photo(phone.db,P2);
  // A new tablet: the starter courses of a fresh install, one of them with the same name.
  const tablet=device(drive,clock,[course('t1','Analyse'),course('t2','Chimie')]);
  return{drive,phone,tablet};
}

test('a fresh tablet gets the phone\'s courses and photos, without a second "Analyse"',async()=>{
  const{phone,tablet}=setup();
  await phone.sync();
  assert.equal(phone.sent.filter(s=>s.kind==='state').length,1,'the phone signals its change');
  await tablet.sync();
  const names=tablet.state().courses.map(c=>c.name).sort();
  assert.deepEqual(names,['Analyse','Chimie']);
  assert.deepEqual(tablet.state().courses.find(c=>c.name==='Analyse').sections[0].sessions[0].photoIds,[P1,P2]);
  assert.equal(tablet.db.stores.photos.size,2,'photos downloaded in the background');
  const row=tablet.db.stores.photos.get(P1);
  assert.equal(await row.blob.text(),`jpeg-${P1}`);
  assert.equal(row.syncState,'synced');assert.ok(row.driveFileId);
});

test('the tablet never uploads the phone\'s photos again',async()=>{
  const{drive,phone,tablet}=setup();
  await phone.sync();await tablet.sync();
  const uploads=drive.calls.filter(c=>c==='POST /upload/drive/v3/files').length;
  await tablet.sync();await phone.sync();
  assert.equal(drive.calls.filter(c=>c==='POST /upload/drive/v3/files').length,uploads);
  assert.equal([...drive.files.values()].filter(f=>f.name==='state.json').length,1);
});

test('what the tablet adds reaches the phone; a rename on the phone reaches the tablet',async()=>{
  const{phone,tablet}=setup();
  await phone.sync();await tablet.sync();
  await phone.pull();
  assert.deepEqual(phone.state().courses.map(c=>c.name).sort(),['Analyse','Chimie'],'Chimie from the tablet');
  phone.edit(s=>{s.courses.find(c=>c.id==='c1').name='Analyse 1'});
  await phone.sync();await tablet.pull();
  assert.ok(tablet.state().courses.some(c=>c.name==='Analyse 1'));
});

test('a séance deleted on the tablet disappears on the phone, with its photos',async()=>{
  const{phone,tablet}=setup();
  await phone.sync();await tablet.sync();
  tablet.edit(s=>{s.courses.find(c=>c.id==='c1').sections[0].sessions=[]});
  await tablet.sync();await phone.pull();
  assert.equal(phone.state().courses.find(c=>c.id==='c1').sections[0].sessions.length,0);
  assert.equal(phone.db.stores.photos.size,0,`local copies removed (Drive keeps its own) left=${[...phone.db.stores.photos.keys()]} deleted=${Object.keys(phone.state().sync.deleted)}`);
});

test('photos taken on both devices at once are all kept',async()=>{
  const{phone,tablet}=setup();
  await phone.sync();await tablet.sync();
  const A='22222222-aaaa-4aaa-8aaa-00000000000a',B='22222222-aaaa-4aaa-8aaa-00000000000b';
  photo(phone.db,A);phone.edit(s=>s.courses[0].sections[0].sessions[0].photoIds.push(A));
  photo(tablet.db,B);tablet.edit(s=>s.courses.find(c=>c.id==='c1').sections[0].sessions[0].photoIds.push(B));
  await phone.sync();await tablet.sync();await phone.sync();
  const ids=d=>d.state().courses.find(c=>c.id==='c1').sections[0].sessions[0].photoIds.slice().sort();
  assert.deepEqual(ids(phone),[P1,P2,A,B].sort());
  assert.deepEqual(ids(tablet),ids(phone));
  assert.ok(phone.db.stores.photos.has(B)&&tablet.db.stores.photos.has(A),'each got the other\'s photo');
});

test('while a remote change waits (camera open), this device never writes over Drive',async()=>{
  const{drive,phone,tablet}=setup();
  await phone.sync();
  tablet.run(`currentView='capture'`);
  await tablet.run('syncStructure({push:false})');
  const before=drive.files.get([...drive.files.values()].find(f=>f.name==='state.json').id).text;
  await tablet.run('syncStructure({push:true})');
  assert.equal(drive.files.get([...drive.files.values()].find(f=>f.name==='state.json').id).text,before,'state.json untouched');
  assert.equal(tablet.state().courses.length,2,'not applied yet');
  tablet.run(`currentView='courses'`);await tablet.run('render()');
  assert.deepEqual(tablet.state().courses.map(c=>c.name).sort(),['Analyse','Chimie']);
});

test('signals carry ids only',async()=>{
  const{phone}=setup();await phone.sync();
  for(const s of phone.sent)for(const v of Object.values(s))assert.ok(v===null||typeof v==='number'||/^[\w-]+$/.test(v),`unexpected value ${v}`);
});

// ── Typed notes (features/notes/notes.js) ──
test('notes typed on the tablet reach the phone through Drive, and stay one Notes.json',async()=>{
  const{drive,phone,tablet}=setup();
  await phone.sync();await tablet.sync();
  await tablet.run(`updateNote('s1',null,'Intégrales — à revoir')`);
  await tablet.run(`updateNote('s1','${P1}','Formule de Stokes')`);
  await tablet.sync();
  const sig=tablet.sent.find(x=>x.kind==='note');
  assert.ok(sig&&sig.refId==='s1'&&sig.driveFileId,'a note signal with the file id');
  await phone.run(`pullSessionNotes('s1',${JSON.stringify(sig.driveFileId)})`);
  const notes=plain(await phone.run(`notesFor('s1')`));
  assert.equal(notes.session.text,'Intégrales — à revoir');
  assert.equal(notes.photos[P1].text,'Formule de Stokes');
  await phone.sync();
  assert.equal([...drive.files.values()].filter(f=>f.name==='Notes.json'&&!f.trashed).length,1,'phone did not upload a copy');
  // The phone edits the photo note: the same file is updated, the tablet finds it in the séance folder.
  await phone.run(`updateNote('s1','${P1}','Formule de Stokes (corrigée)')`);
  await phone.sync();
  assert.equal([...drive.files.values()].filter(f=>f.name==='Notes.json'&&!f.trashed).length,1);
  await tablet.run(`pullSessionNotes('s1')`);
  assert.equal(plain(await tablet.run(`notesFor('s1')`)).photos[P1].text,'Formule de Stokes (corrigée)');
});

test('notes merge note by note: the newer text of each note wins',async()=>{
  const{phone}=setup();
  const m=plain(phone.run(`mergeNotes({session:{text:'a',updatedAt:5},photos:{x:{text:'old',updatedAt:1},y:{text:'only a',updatedAt:3}}},{session:{text:'b',updatedAt:4},photos:{x:{text:'new',updatedAt:2},z:{text:'only b',updatedAt:1}}})`));
  assert.equal(m.session.text,'a');
  assert.deepEqual(Object.fromEntries(Object.entries(m.photos).map(([k,v])=>[k,v.text])),{x:'new',y:'only a',z:'only b'});
});

// ── Live Capture ──
test('live: with a tablet listening, a stored photo is sent at once and appears on the tablet',async()=>{
  const{drive,phone,tablet}=setup();
  await phone.sync();await tablet.sync();
  const N='33333333-aaaa-4aaa-8aaa-000000000001';
  photo(phone.db,N);phone.edit(s=>s.courses[0].sections[0].sessions[0].photoIds.push(N));
  assert.equal(await phone.run(`onPhotoStoredForLive('${N}')`),null,'nobody listening: nothing sent now');
  phone.peers.push({device:'tablet',desk:true,live:true});
  const fileId=await phone.run(`onPhotoStoredForLive('${N}')`);
  assert.ok(fileId&&drive.files.has(fileId),'uploaded right away');
  const sig=phone.sent.find(x=>x.kind==='photo');
  assert.deepEqual({ref:sig.refId,session:sig.sessionId,file:sig.driveFileId},{ref:N,session:null,file:fileId},'séance id only when it is a uuid');
  assert.equal(await tablet.run(`receiveRemotePhoto(${JSON.stringify(sig)})`),true);
  assert.equal(await tablet.db.stores.photos.get(N).blob.text(),`jpeg-${N}`);
  await phone.sync();
  assert.equal([...drive.files.values()].filter(f=>f.name.endsWith('-33333333.jpg')).length,1,'the later full sync does not upload it again');
});
