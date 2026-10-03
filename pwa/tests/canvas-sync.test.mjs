// Notes page on two devices (features/canvas-sync.js + canvas-doc.js + drive.js) against one simulated Drive:
// the page is sent once as Page.json, announced by a signal, read and merged by the other device; edits made apart
// on both devices end up on both; a deletion travels; nothing is sent twice. Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fakeDrive,fakeDb} from './helpers/fake-drive.mjs';

const src=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const sbStub={functions:{invoke:async()=>({data:{access_token:'token',expires_in:3600}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{connected:true}})})})})};
const plain=x=>JSON.parse(JSON.stringify(x));
const SESSION='55555555-aaaa-4aaa-8aaa-000000000001';

function device(drive){
  const db=fakeDb(),storage=new Map(),sent=[],applied=[],tracked=[];
  const window={HoliooSignals:{send:async(_sb,f)=>{sent.push(f)},start(){},stop(){},track:f=>{tracked.push(f)},peers:()=>[]}};
  const ctx=vm.createContext({window,fetch:drive.fetch,Headers,Blob,Response,TextEncoder,URL,URLSearchParams,console,crypto,structuredClone,
    navigator:{onLine:true},setTimeout,clearTimeout,DB:db,sbStub,applied,
    localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}});
  vm.runInContext(src('../drive.js'),ctx);
  vm.runInContext(src('../features/state-merge.js'),ctx);
  vm.runInContext(`
    const Drive=window.HoliooDrive;
    var state={profile:{academicYear:'2026–2027'},courses:[{id:'c1',name:'Analyse',sections:[{id:'sec1',name:'CM',type:'CM',sessions:[{id:'${SESSION}',number:1,title:'CM 1',photoIds:[]}]}]}],inbox:[],files:[],settings:{autoDriveSync:true}};
    var stateOwner='u1',guestMode=false,sb=sbStub,currentUser={id:'u1'},driveStatus={connected:true},currentView='courses';
    function isDesk(){return true}
    function findSessionContext(id){for(const course of state.courses)for(const section of course.sections)for(const session of section.sessions)if(session.id===id)return{course,section,session};return null}
    let queued=[];function queueSync(r){queued.push(r)}
    var canvasRuntime=null;
    function canvasApplyRemote(rt,merged){applied.push(merged)}
    function canvasDiscardRuntime(){canvasRuntime=null}
  `,ctx);
  vm.runInContext(src('../features/remote-sync.js'),ctx);   // the real sendSyncSignal / onRemoteSignal / remoteSyncReady / updatePresence
  vm.runInContext(src('../features/canvas-doc.js'),ctx);
  vm.runInContext(src('../features/canvas-sync.js'),ctx);
  const run=code=>vm.runInContext(code,ctx);
  return{db,sent,applied,tracked,run,
    // The page as this device stores it (what the screen's autosave writes).
    page:()=>db.stores.kv.get(`canvas:${SESSION}`)?.doc,
    write:doc=>db.stores.kv.set(`canvas:${SESSION}`,{key:`canvas:${SESSION}`,doc:structuredClone(doc)}),
    sync:()=>run(`Drive.syncAll({sb,user:currentUser,state,db:DB,documents:canvasDriveDocuments,onDocument:canvasDocumentSent})`),
    pull:(fileId=null)=>run(`pullSessionCanvas('${SESSION}',${fileId?`'${fileId}'`:'null'})`),
    open:()=>run(`canvasRuntime={session:{id:'${SESSION}'},store:canvasStore(normalizeCanvasDoc(${JSON.stringify(db.stores.kv.get('canvas:'+SESSION)?.doc||{})},'${SESSION}')),docStamp:1}`),
    queued:()=>plain(run('queued'))};
}
const photo=(id,x,y,at,extra={})=>({id,type:'photo',photoId:`ph-${id}`,x,y,w:200,h:150,z:1,updatedAt:at,...extra});
const stroke=(id,at,extra={})=>({id,tool:'pen',color:'#111827',size:4.5,sp:0,at,updatedAt:at,pts:[[1,1,.5],[40,40,.5]],...extra});
const doc=(parts={})=>({version:1,sessionId:SESSION,height:1414,bg:'lines',bgAt:0,items:[],strokes:[],known:[],updatedAt:1,...parts});
const live=(d,k)=>d[k].filter(o=>!o.deleted).map(o=>o.id).sort();
const pageFiles=drive=>[...drive.files.values()].filter(f=>f.name==='Page.json'&&!f.trashed);

test('a page that was never written is not created in Drive',async()=>{
  const drive=fakeDrive(),tablet=device(drive);
  const r=await tablet.sync();
  assert.equal(r.synced,0);assert.equal(pageFiles(drive).length,0);
});

test('a written page is sent once as Page.json in the séance folder, then a signal tells the other devices',async()=>{
  const drive=fakeDrive(),tablet=device(drive);
  tablet.write(doc({items:[photo('p1',10,10,5)],strokes:[stroke('s1',6)],updatedAt:6}));
  const r1=await tablet.sync();
  assert.equal(r1.synced,1);
  const files=pageFiles(drive);
  assert.equal(files.length,1);
  assert.equal(drive.folder('CM 1').id,files[0].parents[0],'in Holioo/year/course/section/séance');
  const sig=tablet.sent.filter(s=>s.kind==='canvas');
  assert.equal(sig.length,1);
  assert.equal(sig[0].refId,SESSION);assert.equal(sig[0].driveFileId,files[0].id);assert.equal(sig[0].rev,6);
  assert.ok(!JSON.stringify(sig).includes('ph-p1'),'the signal carries ids only, never content');
  const r2=await tablet.sync();
  assert.equal(r2.synced,0);assert.equal(tablet.sent.filter(s=>s.kind==='canvas').length,1,'nothing changed: nothing sent, no second signal');
  // one more stroke: the same file is replaced in place
  const d=plain(tablet.page());d.strokes.push(stroke('s2',9));d.updatedAt=9;tablet.write(d);
  await tablet.sync();
  assert.equal(pageFiles(drive).length,1,'updated in place, never duplicated');
  assert.equal(tablet.sent.filter(s=>s.kind==='canvas').length,2);
});

test('the other device reads it: by the signal\'s file id, or by looking in the séance folder when it opens the page',async()=>{
  const drive=fakeDrive(),tablet=device(drive),desktop=device(drive);
  tablet.write(doc({items:[photo('p1',10,10,5)],strokes:[stroke('s1',6)],updatedAt:6}));
  await tablet.sync();
  const fileId=pageFiles(drive)[0].id;
  assert.equal(await desktop.pull(fileId),true);
  assert.deepEqual(live(desktop.page(),'items'),['p1']);assert.deepEqual(live(desktop.page(),'strokes'),['s1']);
  assert.equal(await desktop.pull(fileId),false,'the same file is not read again');
  const third=device(drive);
  assert.equal(await third.pull(null),true);assert.deepEqual(live(third.page(),'strokes'),['s1']);
});

test('what the desktop got is not sent back: no upload loop',async()=>{
  const drive=fakeDrive(),tablet=device(drive),desktop=device(drive);
  tablet.write(doc({strokes:[stroke('s1',6)],updatedAt:6}));await tablet.sync();
  await desktop.pull(pageFiles(drive)[0].id);
  const r=await desktop.sync();
  assert.equal(r.synced,0,'the desktop holds exactly what Drive holds');
  assert.equal(desktop.sent.filter(s=>s.kind==='canvas').length,0);
});

test('both devices edit apart, then sync: everything is kept on both, the newest edit of each object wins',async()=>{
  const drive=fakeDrive(),tablet=device(drive),desktop=device(drive);
  tablet.write(doc({items:[photo('p1',10,10,5),photo('p2',300,10,5)],strokes:[stroke('s1',6)],updatedAt:6}));
  await tablet.sync();
  await desktop.pull(pageFiles(drive)[0].id);
  // apart: the tablet draws and moves p1 (older edit); the desktop moves p1 (newer) and deletes p2 and draws
  const t=plain(tablet.page());t.strokes.push(stroke('tab',20));t.items[0]={...t.items[0],x:111,updatedAt:20};t.updatedAt=20;tablet.write(t);
  const d=plain(desktop.page());d.strokes.push(stroke('desk',25));d.items[0]={...d.items[0],x:222,updatedAt:30};d.items[1]={...d.items[1],deleted:true,updatedAt:31};d.height=3000;d.updatedAt=31;desktop.write(d);
  const fileId=pageFiles(drive)[0].id;
  await desktop.sync();                      // the desktop (newer edits) sends first
  await tablet.sync();                       // then the tablet sends its page over the same file
  await desktop.pull(fileId);                // the signal reaches the desktop: it merges, and sees it holds more than the file
  assert.ok(desktop.queued().includes('canvas'),'it asks for a sync to send the union');
  await desktop.sync();                      // the union goes to Drive
  await tablet.pull(fileId);                 // the signal reaches the tablet
  const A=tablet.page(),B=desktop.page();
  for(const x of[A,B]){
    assert.deepEqual(live(x,'strokes'),['desk','s1','tab'],'both strokes, nothing lost');
    assert.deepEqual(live(x,'items'),['p1'],'p2 was deleted on the desktop');
    assert.equal(x.items.find(i=>i.id==='p1').x,222,'the newest edit of p1 (desktop, 30) wins over the tablet\'s (20)');
    assert.equal(x.height,3000);
  }
  // and it settles: nothing more to send, no ping-pong
  assert.equal((await tablet.sync()).synced,0);assert.equal((await desktop.sync()).synced,0);
  assert.equal(pageFiles(drive).length,1,'one Page.json in Drive');
});

test('an erased stroke is erased on the other device too',async()=>{
  const drive=fakeDrive(),tablet=device(drive),desktop=device(drive);
  tablet.write(doc({strokes:[stroke('s1',6),stroke('s2',7)],updatedAt:7}));await tablet.sync();
  await desktop.pull(pageFiles(drive)[0].id);
  const d=plain(desktop.page());d.strokes.find(s=>s.id==='s1').deleted=true;d.strokes.find(s=>s.id==='s1').updatedAt=50;d.updatedAt=50;desktop.write(d);
  await desktop.sync();
  assert.equal(await tablet.pull(pageFiles(drive)[0].id),true);
  assert.deepEqual(live(tablet.page(),'strokes'),['s2']);
});

test('a page open on screen is refreshed through the screen (canvasApplyRemote), not written behind its back',async()=>{
  const drive=fakeDrive(),tablet=device(drive),desktop=device(drive);
  tablet.write(doc({strokes:[stroke('s1',6)],updatedAt:6}));await tablet.sync();
  desktop.write(doc({strokes:[stroke('mine',3)],updatedAt:3}));
  desktop.open();
  await desktop.pull(pageFiles(drive)[0].id);
  assert.equal(desktop.applied.length,1);
  assert.deepEqual(live(plain(desktop.applied[0]),'strokes'),['mine','s1']);
  assert.deepEqual(live(desktop.page(),'strokes'),['mine'],'the stored copy is rewritten by the screen\'s own autosave');
});

test('the desktop had something the file lacked: it is sent on the next sync',async()=>{
  const drive=fakeDrive(),tablet=device(drive),desktop=device(drive);
  tablet.write(doc({strokes:[stroke('s1',6)],updatedAt:6}));await tablet.sync();
  desktop.write(doc({strokes:[stroke('mine',3)],updatedAt:3}));
  await desktop.pull(pageFiles(drive)[0].id);
  assert.ok(desktop.queued().includes('canvas'),'a sync is asked for');
  const r=await desktop.sync();
  assert.equal(r.synced,1);
  await tablet.pull(pageFiles(drive)[0].id);
  assert.deepEqual(live(tablet.page(),'strokes'),['mine','s1']);
});

test('a file that is not a Holioo page is ignored',async()=>{
  const drive=fakeDrive(),tablet=device(drive),desktop=device(drive);
  tablet.write(doc({strokes:[stroke('s1',6)],updatedAt:6}));await tablet.sync();
  const f=pageFiles(drive)[0];f.text='{"app":"Other","kind":"canvas","doc":{}}';f.md5Checksum='md5-other';
  assert.equal(await desktop.pull(f.id),false);
  f.text='not json at all';f.md5Checksum='md5-junk';
  assert.equal(await desktop.pull(f.id),false);
  assert.equal(desktop.page(),undefined,'nothing was stored');
});

test('a deleted séance takes its page with it',async()=>{
  const drive=fakeDrive(),tablet=device(drive);
  tablet.write(doc({strokes:[stroke('s1',6)],updatedAt:6}));await tablet.sync();
  assert.ok(tablet.db.stores.kv.has(`canvas:${SESSION}`));assert.ok(tablet.db.stores.kv.has(`drive:canvas:${SESSION}`));
  await tablet.run(`purgeSessionCanvas(['${SESSION}'])`);
  assert.ok(!tablet.db.stores.kv.has(`canvas:${SESSION}`));assert.ok(!tablet.db.stores.kv.has(`drive:canvas:${SESSION}`));
});

test('the Notes page tells the phone it is listening, so photos reach the tray as they are taken',async()=>{
  const drive=fakeDrive(),tablet=device(drive);
  tablet.run(`var canvasSessionId=()=>'${SESSION}'`);
  tablet.run(`currentView='courses';updatePresence()`);
  tablet.run(`currentView='notes';updatePresence()`);
  tablet.run(`currentView='gallery';updatePresence()`);
  assert.deepEqual(tablet.tracked.map(t=>[t.live,t.sessionId]),[[false,null],[true,SESSION],[false,null]],'listening only while the Notes page is open, and for its séance');
  assert.ok(tablet.tracked.every(t=>t.desk===true));
});
