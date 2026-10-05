// Two devices of one Google account syncing through one simulated Google Drive (drive.js + cloud-sync.js):
// what one adds, moves or removes arrives on the other, photos and PDFs included, and nothing is lost.
// Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const driveCode=fs.readFileSync(new URL('../sync/drive.js',import.meta.url),'utf8');
const cloudCode=fs.readFileSync(new URL('../sync/cloud-sync.js',import.meta.url),'utf8');

// ── A small in-memory Google Drive that keeps file contents ──
function fakeDrive(){
  const files=new Map();let n=0,clock=1e12;const calls=[];const fail={download:null};
  const json=(status,body)=>({ok:status<300,status,text:async()=>JSON.stringify(body),blob:async()=>new Blob([JSON.stringify(body)])});
  const notFound=id=>json(404,{error:{message:`File not found: ${id}`,errors:[{reason:'notFound'}]}});
  const alive=id=>files.has(id)||id==='root';
  const stamp=f=>{f.modifiedTime=new Date(++clock).toISOString()};
  const body=async b=>b instanceof Blob?await b.text():String(b);
  async function fetch(url,opts={}){
    const u=new URL(url),method=opts.method||'GET';calls.push(`${method} ${u.pathname}${u.searchParams.get('alt')?'?alt='+u.searchParams.get('alt'):''}`);
    if(u.pathname==='/drive/v3/files'&&method==='GET'){
      const q=u.searchParams.get('q'),name=/name='((?:[^'\\]|\\.)*)'/.exec(q)[1].replace(/\\'/g,"'"),parent=/'([^']+)' in parents/.exec(q)[1],wantFolder=q.includes('mimeType=');
      return json(200,{files:[...files.values()].filter(f=>!f.trashed&&f.name===name&&f.parents.includes(parent)&&!!f.folder===wantFolder)});
    }
    if(u.pathname==='/drive/v3/files'&&method==='POST'){
      const b=JSON.parse(opts.body);if(!alive(b.parents[0]))return notFound(b.parents[0]);
      const f={id:`f${++n}`,name:b.name,parents:b.parents,folder:true};stamp(f);files.set(f.id,f);return json(200,f);
    }
    if(u.pathname==='/upload/drive/v3/files'&&method==='POST'){
      const raw=await body(opts.body),boundary=/boundary=(\S+)/.exec(opts.headers['Content-Type']||opts.headers.get?.('Content-Type'))[1];
      const parts=raw.split(`--${boundary}`),meta=JSON.parse(/\{[\s\S]*\}/.exec(parts[1])[0]);
      const content=parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/,'');
      if(!alive(meta.parents[0]))return notFound(meta.parents[0]);
      const f={id:`p${++n}`,name:meta.name,parents:meta.parents,content};stamp(f);files.set(f.id,f);return json(200,f);
    }
    const m=/^\/(upload\/)?drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
    if(m){
      const id=decodeURIComponent(m[2]),f=files.get(id);if(!f)return notFound(id);
      if(method==='GET'){
        if(u.searchParams.get('alt')==='media'){
          if(fail.download&&f.name.includes(fail.download))return json(500,{error:{message:'Backend error'}});
          return{ok:true,status:200,text:async()=>f.content,blob:async()=>new Blob([f.content])};
        }
        return json(200,f);
      }
      if(m[1]){f.content=await body(opts.body);stamp(f);return json(200,f)}
      const add=u.searchParams.get('addParents');if(add&&!alive(add))return notFound(add);
      const rm=(u.searchParams.get('removeParents')||'').split(',').filter(Boolean);
      f.parents=[...f.parents.filter(p=>!rm.includes(p)),...(add&&!f.parents.includes(add)?[add]:[])];
      const b=JSON.parse(opts.body||'{}');if(b.name)f.name=b.name;if(b.trashed)f.trashed=true;stamp(f);
      return json(200,f);
    }
    throw new Error(`Unexpected ${method} ${url}`);
  }
  return{files,fetch,calls,fail,manifest:()=>[...files.values()].find(f=>f.name==='holioo-sync.json')};
}

function fakeDb(){
  const stores={photos:new Map(),files:new Map(),kv:new Map()};
  return{stores,
    get:async(s,k)=>stores[s].get(k)&&structuredClone(stores[s].get(k)),
    put:async(s,v)=>{stores[s].set(v.id??v.key,structuredClone(v));return v},
    del:async(s,k)=>{stores[s].delete(k)},
    keys:async s=>[...stores[s].keys()],
    all:async s=>[...stores[s].values()].map(v=>({...v})),
    patch:async(s,k,ch)=>{const r=stores[s].get(k);if(!r)return null;const next={...r,...(typeof ch==='function'?ch(r):ch)};stores[s].set(k,next);return next}};
}

const sb={functions:{invoke:async()=>({data:{access_token:'token'}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{connected:true,email:'x@y.z'}})})})})};
const clone=v=>JSON.parse(JSON.stringify(v));

// One device: its own state, database and code, the same Drive.
function device(drive,{state}){
  const storage=new Map(),window={};
  const ctx={window,fetch:drive.fetch,Headers,Blob,Response,TextEncoder,URL,URLSearchParams,navigator:{onLine:true},console:{...console,warn(){}},
    localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}};
  vm.runInNewContext(driveCode+';\n'+cloudCode,ctx);
  const db=fakeDb(),D=window.HoliooDrive;
  const dev={state,db,D,
    sync:async()=>{const r=await D.syncAll({sb,user:{id:'u1'},state,db,save:()=>{dev.saves++}});return r},saves:0,
    addPhoto:async(id,text=id)=>{await db.put('photos',{id,blob:new Blob(['jpeg-'+text],{type:'image/jpeg'}),createdAt:'2026-10-01T10:00:00Z',syncState:'pending'})},
    blobText:async id=>{const r=await db.get('photos',id);return r?.blob?await r.blob.text():null}};
  return dev;
}
const course=(id,name,sessions=[])=>({id,name,color:'#506BFF',defaultSectionsSeeded:true,sections:[{id:id+'-cm',name:'CM',type:'CM',sortOrder:0,sessions},{id:id+'-td',name:'TD',type:'TD',sortOrder:1,sessions:[]}]});
const session=(id,title,photoIds=[])=>({id,number:1,title,photoIds,createdAt:'2026-10-01T10:00:00Z',visibility:'private'});
const newState=(courses=[])=>({profile:{academicYear:'2026–2027'},inbox:[],files:[],favorites:[],timetable:[],courses,lastModified:1});
const sessionOf=(s,id)=>s.courses.flatMap(c=>c.sections.flatMap(x=>x.sessions)).find(q=>q.id===id);

async function phoneWithData(drive){
  const phone=device(drive,{state:newState([course('c1','VHDL',[session('s1','CM 1',['p1','p2','p3'])]),course('c2','Mathématiques')])});
  for(const id of['p1','p2','p3'])await phone.addPhoto(id);
  await phone.sync();return phone;
}
const tabletFresh=drive=>device(drive,{state:newState([course('t1','VHDL'),course('t2','Mathématiques'),course('t3','Électronique')])});

test('a new tablet signed in with the same account gets the phone\'s courses, séances and photos',async()=>{
  const drive=fakeDrive(),phone=await phoneWithData(drive);
  assert.ok(drive.manifest(),'the phone wrote the account snapshot');
  const tablet=tabletFresh(drive);
  const r=await tablet.sync();
  assert.equal(r.received,3,'three photos fetched');
  assert.deepEqual(tablet.state.courses.map(c=>c.name).sort(),['Mathématiques','VHDL','Électronique'].sort(),'no duplicate sample courses (the tablet own Électronique stays)');
  assert.equal(tablet.state.courses.filter(c=>c.name==='VHDL').length,1);
  assert.deepEqual([...sessionOf(tablet.state,'s1').photoIds],['p1','p2','p3']);
  for(const id of['p1','p2','p3'])assert.equal(await tablet.blobText(id),'jpeg-'+id,'the photo itself is here');
  const row=await tablet.db.get('photos','p1');assert.equal(row.driveFileId&&row.syncState,'synced');assert.ok(!row.placeholder);
});

test('a second sync with nothing new only looks at the snapshot: no download, no upload, no rewrite',async()=>{
  const drive=fakeDrive(),phone=await phoneWithData(drive),tablet=tabletFresh(drive);
  await tablet.sync();
  drive.calls.length=0;
  const r=await tablet.sync();
  assert.equal(r.received,0);assert.equal(r.synced,0);assert.equal(r.pushed,false);
  assert.ok(!drive.calls.some(c=>c.includes('alt=media')||c.startsWith('POST /upload')||c.startsWith('PATCH /upload')),'nothing transferred: '+drive.calls.join(' | '));
});

test('what the tablet adds reaches the phone',async()=>{
  const drive=fakeDrive(),phone=await phoneWithData(drive),tablet=tabletFresh(drive);
  await tablet.sync();
  await tablet.addPhoto('p4','written-on-tablet');sessionOf(tablet.state,'s1').photoIds.push('p4');tablet.state.lastModified=Date.now();
  tablet.state.courses.push(course('c9','Projet tablette'));
  await tablet.sync();
  const r=await phone.sync();
  assert.equal(r.received,1);assert.ok(phone.state.courses.some(c=>c.name==='Projet tablette'));
  assert.deepEqual([...sessionOf(phone.state,'s1').photoIds],['p1','p2','p3','p4']);
  assert.equal(await phone.blobText('p4'),'jpeg-written-on-tablet');
});

test('what the phone deletes is deleted on the tablet, photos included',async()=>{
  const drive=fakeDrive(),phone=await phoneWithData(drive),tablet=tabletFresh(drive);
  await tablet.sync();
  sessionOf(phone.state,'s1').photoIds=['p1'];phone.state.lastModified=Date.now();   // p2, p3 deleted on the phone
  await phone.db.del('photos','p2');await phone.db.del('photos','p3');
  await phone.sync();
  await tablet.sync();
  assert.deepEqual([...sessionOf(tablet.state,'s1').photoIds],['p1']);
  assert.equal(await tablet.blobText('p2'),null,'the copy on the tablet is gone too');
  assert.equal(await tablet.blobText('p1'),'jpeg-p1');
});

test('a photo that could not be fetched is fetched next time, and counted as waiting meanwhile',async()=>{
  const drive=fakeDrive(),phone=await phoneWithData(drive),tablet=tabletFresh(drive);
  drive.fail.download='002-p2';
  const r1=await tablet.sync();
  assert.equal(r1.received,2);assert.equal(r1.receivedFailed,1);
  assert.equal(await tablet.blobText('p2'),null);
  assert.equal(await tablet.D.pendingCount(tablet.state,tablet.db),1,'one photo still to fetch');
  drive.fail.download=null;
  const r2=await tablet.sync();
  assert.equal(r2.received,1);assert.equal(await tablet.blobText('p2'),'jpeg-p2');
  assert.equal(await tablet.D.pendingCount(tablet.state,tablet.db),0);
});

test('both devices work while apart, then sync: everything is kept on both',async()=>{
  const drive=fakeDrive(),phone=await phoneWithData(drive),tablet=tabletFresh(drive);
  await tablet.sync();
  await phone.addPhoto('from-phone');sessionOf(phone.state,'s1').photoIds.push('from-phone');phone.state.lastModified=Date.now();
  await tablet.addPhoto('from-tablet');sessionOf(tablet.state,'s1').photoIds.push('from-tablet');tablet.state.lastModified=Date.now()+5;
  await phone.sync();await tablet.sync();await phone.sync();
  for(const d of[phone,tablet]){
    assert.deepEqual([...sessionOf(d.state,'s1').photoIds].sort(),['from-phone','from-tablet','p1','p2','p3'],'same photos on both');
    assert.equal(await d.blobText('from-phone'),'jpeg-from-phone');assert.equal(await d.blobText('from-tablet'),'jpeg-from-tablet');
  }
});

test('PDFs are shared too',async()=>{
  const drive=fakeDrive(),phone=await phoneWithData(drive),tablet=tabletFresh(drive);
  phone.state.files.push({id:'f1',title:'Cours VHDL',fileName:'Cours VHDL.pdf',courseId:'c1',sessionIds:['s1'],createdAt:'2026-10-02T10:00:00Z',pages:3});
  await phone.db.put('files',{id:'f1',blob:new Blob(['%PDF-fake']),createdAt:'x',syncState:'pending'});phone.state.lastModified=Date.now();
  await phone.sync();
  const r=await tablet.sync();
  assert.equal(tablet.state.files[0].title,'Cours VHDL');
  const row=await tablet.db.get('files','f1');assert.equal(await row.blob.text(),'%PDF-fake');
  assert.equal(r.received,4,'3 photos and 1 PDF');
});

test('a device without a Drive connection, or the old code without the cloud module, behaves as before',async()=>{
  const drive=fakeDrive(),phone=device(drive,{state:newState([course('c1','VHDL',[session('s1','CM 1',['p1'])])])});
  await phone.addPhoto('p1');
  const r=await phone.D.syncAll({sb,user:{id:'u1'},state:phone.state,db:phone.db,cloud:null});
  assert.equal(r.synced,1);assert.equal(drive.manifest(),undefined,'no snapshot written without the cloud module');
});
