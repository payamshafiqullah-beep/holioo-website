import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const captureParts=['capture-destination','capture-status','camera-stream','camera-scan-modes','capture-shutter','capture-batch'].map(n=>`../features/camera/${n}.js`);

function setup(){
  const sections=['CM','TD','TP'].map(id=>({id,name:id,sessions:[1,2].map(n=>({id:id+n,number:n,photoIds:[],title:id+n,createdAt:'2026-09-30'}))}));
  const state={courses:[{id:'course',name:'Course',sections}],inbox:[],cameraRecent:[],cameraLast:{courseId:'course',sectionId:'CM',sessionId:'CM1'}};
  const ctx={state,currentCourseId:'course',currentSectionId:'TD',currentSessionId:'TD2',byId:()=>null,saveState(){},window:{addEventListener(){}},clearTimeout,setTimeout,DB:{get:async()=>null,put:async()=>{}},now:()=>new Date().toISOString(),uid:()=> 'new-session'};
  ctx.findSessionContext=(id=ctx.currentSessionId)=>{for(const course of state.courses)for(const section of course.sections){const session=section.sessions.find(s=>s.id===id);if(session)return{course,section,session}}};
  vm.createContext(ctx);
  ctx.Scanner={subscribe(){}};
  vm.runInContext(read('../features/camera/camera-destination.js'),ctx);
  vm.runInContext(read('../features/camera/camera-queue.js'),ctx);
  for(const f of captureParts)vm.runInContext(read(f),ctx);
  vm.runInContext('setCameraThumb=()=>{}; renderCameraChip=()=>{};',ctx);
  const run=code=>vm.runInContext(code,ctx);
  return{ctx,state,run};
}

for(const section of ['CM','TD','TP'])test(`${section}: session origin overrides timetable and previous session`,()=>{
  const{ctx,state,run}=setup();ctx.currentSectionId=section;ctx.currentSessionId=section+'2';
  ctx.resolveCameraDestination=()=>{throw Error('Automatic destination must not override explicit origin')};
  run("camKeepBatch=true; camShots=['old']; camRetakeId='old'; prepareCameraEntry('session'); initCameraDestination()");
  assert.equal(run('camDest.sessionId'),section+'2');
  assert.equal(run('camShots.length'),0);assert.equal(run('camRetakeId'),null);
  assert.equal(state.cameraLast.sessionId,section+'2');
  assert.equal(ctx.destinationForShot().sessionId,section+'2');
  assert.equal(state.courses[0].sections.find(s=>s.id===section).sessions.length,2);
});

test('section camera creates a session in that section, ignoring stale session ID',()=>{
  const{ctx,run}=setup();run("prepareCameraEntry('section'); initCameraDestination()");
  assert.equal(run('camDest.sectionId'),'TD');assert.equal(run('camDest.sessionId'),null);
  const shot=ctx.destinationForShot();assert.equal(shot.sectionId,'TD');assert.equal(shot.sessionId,'new-session');
  assert.equal(ctx.destinationForShot().sessionId,'new-session');
});

test('plain camera (home) has no destination: photos wait in Captures, no stale navigation IDs or batch',()=>{
  const{ctx,run}=setup();ctx.resolveCameraDestination=()=>({courseId:'course',sectionId:'CM',sessionId:'CM1'});
  run("camKeepBatch=true; prepareCameraEntry('home'); initCameraDestination()");
  assert.equal(run('camDest'),null);
});

for(const view of ['scanReview','photoViewer'])test(`${view}: returning keeps pages, destination and retake`,()=>{
  const{run}=setup();run("prepareCameraEntry('session'); initCameraDestination(); camShots=['page']; camRetakeId='page'; camKeepBatch=true");
  run(`prepareCameraEntry('${view}'); initCameraDestination()`);
  assert.equal(run('camDest.sessionId'),'TD2');assert.equal(run('camShots[0]'),'page');assert.equal(run('camRetakeId'),'page');
});

test('pending photo retains its session when the user switches to another session',async()=>{
  const{ctx,run}=setup();
  let finish;ctx.blob=new Promise(resolve=>{finish=resolve});let stored;const done=new Promise(resolve=>{stored=resolve});ctx.stored=stored;
  run("prepareCameraEntry('session'); initCameraDestination(); cameraQueue.add({id:'photo',blob,dest:destinationForShot(),onStored:stored})");
  ctx.currentSectionId='TP';ctx.currentSessionId='TP2';run("prepareCameraEntry('session'); initCameraDestination()");
  finish('image');await done;
  assert.deepEqual(ctx.findSessionContext('TD2').session.photoIds,['photo']);assert.deepEqual(ctx.findSessionContext('TP2').session.photoIds,[]);
});

for(const count of [0,1,5])test(`session camera button stays visible with ${count} photos`,async()=>{
  const{ctx}=setup();ctx.findSessionContext().session.photoIds=Array.from({length:count},(_,i)=>String(i));
  Object.assign(ctx,{enableMultiSelect:()=>null,bulkRemovePhotos:()=>{},app:{innerHTML:''},PageHeader:()=>'',PageIntro:()=>'',SectionTitle:()=>'',pdfRowMarkup:()=>'',EmptyState:()=>'',ActionButton:({id,attrs,label})=>`<button id="${id}" ${attrs||''}>${label}</button>`,plural:()=>'',fmtDate:()=>'',icon:()=>'',byId:()=>({addEventListener(){}}),fillSessionThumbs:async()=>{},updateSessionOcrLabel(){},isDesk:()=>false});ctx.state.files=ctx.state.files||[];
  vm.runInContext(read('../features/courses/SessionPage.js'),ctx);await ctx.renderSession();
  assert.match(ctx.app.innerHTML,/id="addSessionPhotos" data-nav="capture"/);
  assert.equal((ctx.app.innerHTML.match(/id="addSessionPhotos"/g)||[]).length,1);
});

test('navigation captures the origin before replacing currentView',()=>{
  const source=read('../core/navigation.js');const start=source.indexOf('function navigate('),end=source.indexOf('\ndocument.addEventListener',start);
  const ctx={currentView:'session',appShell:{classList:{toggle(){}}},prepareCameraEntry:view=>{ctx.origin=view},setNav(){},setChrome(){},window:{scrollTo(){}},render:async()=>{}};
  vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);ctx.navigate('capture');assert.equal(ctx.origin,'session');assert.equal(ctx.currentView,'capture');
});
