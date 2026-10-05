// Drive sync (drive.js) against a simulated Google Drive: no duplicates, no needless work,
// one failing photo doesn't stop the others, stale folders and edited photos are handled.
// Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { driveSource } from './helpers/app-files.mjs';
import {fakeDrive,fakeDb} from './helpers/fake-drive.mjs';

const code=driveSource();

function load(drive){
  const storage=new Map();
  const window={};
  const ctx={window,fetch:drive.fetch,Headers,Blob,Response,TextEncoder,URL,URLSearchParams,navigator:{onLine:true},console,
    localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}};
  vm.runInNewContext(code,ctx);
  return window.HoliooDrive;
}
const sb={functions:{invoke:async()=>({data:{access_token:'token'}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{connected:true,email:'x@y.z'}})})})})};

function setup(nPhotos=3){
  const drive=fakeDrive(),db=fakeDb(),D=load(drive);
  const ids=Array.from({length:nPhotos},(_,i)=>`photo-${i}-aaaaaaaa`);
  for(const id of ids)db.stores.photos.set(id,{id,blob:new Blob(['jpeg-'+id],{type:'image/jpeg'}),syncState:'pending'});
  const session={id:'s1',title:'CM 1',photoIds:[...ids]};
  const state={profile:{academicYear:'2026–2027'},inbox:[],files:[],courses:[{name:'Analyse',sections:[{name:'CM',sessions:[session]}]}]};
  return{drive,db,D,ids,session,state,sync:(user={id:'u1'})=>D.syncAll({sb,user,state,db})};
}

test('first sync uploads every photo into Holioo/year/course/section/session',async()=>{
  const t=setup(3);
  const r=await t.sync();
  assert.equal(r.synced,3);assert.equal(r.failed,0);
  const folder=t.drive.folder('CM 1');
  assert.equal(t.drive.photosIn(folder.id).length,3);
  assert.deepEqual(t.drive.photosIn(folder.id).map(f=>f.name).sort(),['001-photo-0-.jpg','002-photo-1-.jpg','003-photo-2-.jpg']);
  assert.equal((await t.db.get('photos',t.ids[0])).syncState,'synced');
});

test('a second sync with no change does nothing (no uploads, nothing counted)',async()=>{
  const t=setup(3);await t.sync();
  t.drive.calls.length=0;
  const r=await t.sync();
  assert.equal(r.synced,0);
  assert.deepEqual(t.drive.calls,[],'no Drive request at all');
});

test('reordering renames files in place, never duplicates them',async()=>{
  const t=setup(3);await t.sync();
  t.session.photoIds.reverse();
  const r=await t.sync();
  assert.equal(r.synced,2,'the middle photo keeps its place');
  const inFolder=t.drive.photosIn(t.drive.folder('CM 1').id);
  assert.equal(inFolder.length,3,'still 3 files');
  assert.equal(inFolder.find(f=>f.name.startsWith('001')).name,'001-photo-2-.jpg');
});

test('one failing photo does not stop the others, and is retried next time',async()=>{
  const t=setup(3);t.drive.fail.upload='photo-1';
  const r=await t.sync();
  assert.equal(r.synced,2);assert.equal(r.failed,1);
  assert.equal((await t.db.get('photos',t.ids[1])).syncState,'error');
  t.drive.fail.upload=null;
  const r2=await t.sync();
  assert.equal(r2.synced,1);assert.equal(r2.failed,0);
  assert.equal(t.drive.photosIn(t.drive.folder('CM 1').id).length,3);
});

test('a folder deleted in Drive is recreated (stale cached id)',async()=>{
  const t=setup(1);await t.sync();
  const old=t.drive.folder('CM 1');t.drive.files.delete(old.id);
  const id='photo-new-bbbbbbbb';t.db.stores.photos.set(id,{id,blob:new Blob(['x'],{type:'image/jpeg'})});t.session.photoIds.push(id);
  const r=await t.sync();
  assert.equal(r.failed,0);
  const fresh=t.drive.folder('CM 1');assert.notEqual(fresh.id,old.id);
  assert.ok(t.drive.photosIn(fresh.id).some(f=>f.name==='002-photo-ne.jpg'));
});

test('an edited photo replaces the content of the same Drive file',async()=>{
  const t=setup(1);await t.sync();
  const before=(await t.db.get('photos',t.ids[0])).driveFileId;
  await t.db.patch('photos',t.ids[0],{rendered:new Blob(['edited!!'],{type:'image/jpeg'}),editedAt:'2026-10-01',driveNeedsUpdate:true});
  const r=await t.sync();
  assert.equal(r.synced,1);
  const row=await t.db.get('photos',t.ids[0]);
  assert.equal(row.driveFileId,before,'same file');
  assert.equal(row.driveNeedsUpdate,false);
  assert.equal(t.drive.files.get(before).updated,1);
  assert.equal([...t.drive.files.values()].filter(f=>!f.folder).length,1,'no duplicate');
});

test('Drive full stops the sync and marks the photo',async()=>{
  const t=setup(2);t.drive.fail.full=true;
  await assert.rejects(t.sync(),e=>e.code==='DRIVE_FULL');
  assert.equal((await t.db.get('photos',t.ids[0])).syncState,'drive_full');
});

test('pending count includes edited photos waiting for Drive',async()=>{
  const t=setup(2);
  assert.equal(await t.D.pendingCount(t.state,t.db),2);
  await t.sync();
  assert.equal(await t.D.pendingCount(t.state,t.db),0);
  await t.db.patch('photos',t.ids[0],{driveNeedsUpdate:true});
  assert.equal(await t.D.pendingCount(t.state,t.db),1);
});

// ── Notebooks: several files per session (one image per written page + Carnet.json) ──
function notebook(t){
  const nb={version:1,empty:false,pages:[['Carnet-01.jpg','a'],['Carnet-02.jpg','b']],data:'d1',built:0,failOn:null};
  nb.documents=async st=>[{id:'ink:s1',version:nb.version,empty:nb.empty,folder:[st.courses[0].name,'CM',t.session.title],
    parts:async()=>{nb.built++;return[...nb.pages,['Carnet.json',nb.data]].map(([name,sig])=>({name,sig,blob:()=>new Blob([name+sig],{type:'image/jpeg'})}))}}];
  nb.sync=()=>t.D.syncAll({sb,user:{id:'u1'},state:t.state,db:t.db,documents:nb.documents});
  nb.pending=()=>t.D.pendingCount(t.state,t.db,nb.documents);
  nb.live=()=>[...t.drive.files.values()].filter(f=>!f.folder&&!f.trashed&&f.name.startsWith('Carnet'));
  nb.names=()=>nb.live().map(f=>`${t.drive.files.get(f.parents[0]).name}/${f.name}`).sort();
  nb.uploads=()=>t.drive.calls.filter(c=>c==='POST /upload/drive/v3/files').length;
  return nb;
}
test('notebook: pages and data go to the session folder once; unchanged pages are never sent again',async()=>{
  const t=setup(0),nb=notebook(t);
  assert.equal(await nb.pending(),1);
  let r=await nb.sync();
  assert.deepEqual(nb.names(),['CM 1/Carnet-01.jpg','CM 1/Carnet-02.jpg','CM 1/Carnet.json']);assert.equal(r.synced,1);
  assert.equal(await nb.pending(),0);
  r=await nb.sync();assert.equal(nb.built,1,'unchanged notebook: pages not even drawn');assert.equal(r.synced,0);
  // New strokes on page 2: only page 2 and the data are replaced, in the same files.
  nb.version=2;nb.pages[1][1]='b2';nb.data='d2';
  assert.equal(await nb.pending(),1);
  const uploads=nb.uploads();r=await nb.sync();
  assert.equal(nb.uploads(),uploads,'no new file');assert.equal(r.synced,1);
  const byName=Object.fromEntries(nb.live().map(f=>[f.name,f]));
  assert.equal(byName['Carnet-01.jpg'].updated,undefined);assert.equal(byName['Carnet-02.jpg'].updated,1);assert.equal(byName['Carnet.json'].updated,1);
  // Saved again without any visible change: nothing sent.
  nb.version=3;r=await nb.sync();assert.equal(r.synced,0);assert.equal(await nb.pending(),0);
});
test('notebook: a renamed session moves its files; a page that is gone goes to the Drive trash',async()=>{
  const t=setup(0),nb=notebook(t);await nb.sync();
  t.session.title='CM 1 — Intégrales';nb.pages.pop();nb.version=2;
  const uploads=nb.uploads();await nb.sync();
  assert.equal(nb.uploads(),uploads);
  assert.deepEqual(nb.names(),['CM 1 — Intégrales/Carnet-01.jpg','CM 1 — Intégrales/Carnet.json']);
  assert.equal([...t.drive.files.values()].filter(f=>f.trashed).map(f=>f.name).join(),'Carnet-02.jpg');
});
test('notebook: a failure midway never leads to a second copy of the pages already sent',async()=>{
  const t=setup(0),nb=notebook(t);t.drive.fail.upload='Carnet-02';
  const r=await nb.sync();assert.equal(r.failed,1);assert.equal(await nb.pending(),1,'retried next time');
  t.drive.fail.upload=null;await nb.sync();
  assert.deepEqual(nb.names(),['CM 1/Carnet-01.jpg','CM 1/Carnet-02.jpg','CM 1/Carnet.json']);
  assert.equal(await nb.pending(),0);
});
test('notebook never written in: nothing is created in Drive, nothing counted',async()=>{
  const t=setup(0),nb=notebook(t);nb.empty=true;nb.pages=[];
  assert.equal(await nb.pending(),0);await nb.sync();
  assert.equal(nb.built,0);assert.equal(t.drive.folder('CM 1'),undefined);
});

// ── Course structure shared by the devices (Holioo/.holioo/state.json) and the access token ──
test('state.json: written once, updated in place, read back only when it changed',async()=>{
  const t=setup(0),ctx=await t.D.context(sb,'u1');
  assert.deepEqual({...await t.D.readState(ctx,{})},{id:null,md5:null,data:null},'nothing yet: nothing created');
  assert.equal(t.drive.folder('.holioo'),undefined);
  const w1=await t.D.writeState(ctx,{courses:[1]},{});
  const r1=await t.D.readState(ctx,{});
  assert.equal(r1.id,w1.id);assert.deepEqual(JSON.parse(JSON.stringify(r1.data)),{courses:[1]});
  const w2=await t.D.writeState(ctx,{courses:[1,2]},w1);
  assert.equal(w2.id,w1.id,'same file');
  assert.equal([...t.drive.files.values()].filter(f=>f.name==='state.json').length,1);
  const before=t.drive.fail.downloads;
  const r2=await t.D.readState(ctx,w2);
  assert.equal(r2.data,null,'unchanged: not downloaded');assert.equal(t.drive.fail.downloads,before);
  assert.equal(t.drive.files.get(w1.id).parents[0],t.drive.folder('.holioo').id);
});

test('access token: reused until it expires, renewed once after a 401',async()=>{
  const t=setup(1);let minted=0;
  const sb2={...sb,functions:{invoke:async()=>({data:{access_token:`token${++minted}`,expires_in:3600}})}};
  await t.D.syncAll({sb:sb2,user:{id:'u1'},state:t.state,db:t.db});
  await t.D.syncAll({sb:sb2,user:{id:'u1'},state:t.state,db:t.db});
  assert.equal(minted,1,'one token for both syncs');
  t.drive.fail.expire=true;
  const ctx=await t.D.context(sb2,'u1');await t.D.readState(ctx,{});
  assert.equal(minted,2,'renewed after the 401');assert.equal(ctx.token,'token2');
  t.D.forgetToken();await t.D.context(sb2,'u1');assert.equal(minted,3);
});

test('pushPhoto sends one photo now and returns its Drive id; downloadFile reads it back',async()=>{
  const t=setup(2);
  const id=await t.D.pushPhoto({sb,user:{id:'u1'},state:t.state,db:t.db,id:t.ids[1]});
  assert.ok(id);assert.equal((await t.db.get('photos',t.ids[1])).driveFileId,id);
  assert.equal((await t.db.get('photos',t.ids[0])).driveFileId,undefined,'only that photo');
  assert.equal(t.drive.files.get(id).name,'002-photo-1-.jpg');
  const blob=await t.D.downloadFile(await t.D.context(sb,'u1'),id);
  assert.equal(await blob.text(),'jpeg-photo-1-aaaaaaaa');
  const r=await t.sync();assert.equal(r.synced,1,'the full sync then sends only the other one');
});
