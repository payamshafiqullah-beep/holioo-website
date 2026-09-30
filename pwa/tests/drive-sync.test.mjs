// Drive sync (drive.js) against a simulated Google Drive: no duplicates, no needless work,
// one failing photo doesn't stop the others, stale folders and edited photos are handled.
// Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync(new URL('../drive.js',import.meta.url),'utf8');

// ── A small in-memory Google Drive ──
function fakeDrive(){
  const files=new Map();let n=0;const calls=[];
  const fail={upload:null,full:false};
  const json=(status,body)=>({ok:status<300,status,text:async()=>JSON.stringify(body)});
  const notFound=id=>json(404,{error:{message:`File not found: ${id}`,errors:[{reason:'notFound'}]}});
  const alive=id=>files.has(id)||id==='root';
  async function fetch(url,opts={}){
    const u=new URL(url),method=opts.method||'GET';calls.push(`${method} ${u.pathname}`);
    if(u.pathname==='/drive/v3/files'&&method==='GET'){
      const q=u.searchParams.get('q');const name=/name='((?:[^'\\]|\\.)*)'/.exec(q)[1].replace(/\\'/g,"'");const parent=/'([^']+)' in parents/.exec(q)[1];
      return json(200,{files:[...files.values()].filter(f=>f.folder&&!f.trashed&&f.name===name&&f.parents.includes(parent))});
    }
    if(u.pathname==='/drive/v3/files'&&method==='POST'){
      const b=JSON.parse(opts.body);if(!alive(b.parents[0]))return notFound(b.parents[0]);
      const f={id:`f${++n}`,name:b.name,parents:b.parents,folder:true};files.set(f.id,f);return json(200,f);
    }
    if(u.pathname==='/upload/drive/v3/files'&&method==='POST'){
      const raw=await new Response(opts.body).text();const meta=JSON.parse(/\{.*\}/.exec(raw)[0]);
      if(fail.full)return json(403,{error:{message:'The user\'s Drive storage quota has been exceeded.',errors:[{reason:'storageQuotaExceeded'}]}});
      if(fail.upload&&meta.name.includes(fail.upload))return json(500,{error:{message:'Backend error'}});
      if(!alive(meta.parents[0]))return notFound(meta.parents[0]);
      const f={id:`p${++n}`,name:meta.name,parents:meta.parents,content:raw.length};files.set(f.id,f);return json(200,f);
    }
    const m=/^\/(upload\/)?drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
    if(m){
      const id=decodeURIComponent(m[2]),f=files.get(id);if(!f)return notFound(id);
      if(method==='GET')return json(200,f);
      if(m[1]){f.content=`updated-${opts.body.size}`;f.updated=(f.updated||0)+1;return json(200,f)}
      const add=u.searchParams.get('addParents');if(add&&!alive(add))return notFound(add);
      const rm=(u.searchParams.get('removeParents')||'').split(',').filter(Boolean);
      f.parents=[...f.parents.filter(p=>!rm.includes(p)),...(add&&!f.parents.includes(add)?[add]:[])];
      const body=JSON.parse(opts.body||'{}');if(body.name)f.name=body.name;
      return json(200,f);
    }
    throw new Error(`Unexpected ${method} ${url}`);
  }
  const photosIn=folderId=>[...files.values()].filter(f=>!f.folder&&f.parents.includes(folderId));
  const folder=name=>[...files.values()].find(f=>f.folder&&f.name===name);
  return{files,fetch,calls,fail,photosIn,folder};
}

function fakeDb(){
  const stores={photos:new Map(),files:new Map()};
  return{stores,
    get:async(s,k)=>stores[s].get(k)&&{...stores[s].get(k)},
    put:async(s,v)=>{stores[s].set(v.id,{...v});return v},
    all:async s=>[...stores[s].values()].map(v=>({...v})),
    patch:async(s,k,ch)=>{const r=stores[s].get(k);if(!r)return null;const next={...r,...(typeof ch==='function'?ch(r):ch)};stores[s].set(k,next);return next}};
}

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
