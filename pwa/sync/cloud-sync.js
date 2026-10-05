'use strict';
// Same Google account, same files on every device (phone, tablet, computer).
//
// Until now Drive was a one-way backup: each device kept its own list of courses / séances / photos. This is the
// other half. Every sync, the device
//   1. reads the account's snapshot in Drive (Holioo/holioo-sync.json: courses, sections, séances, Captures, PDFs,
//      favourites, timetable, and where each photo / PDF is in Drive),
//   2. merges it into its own state (three-way: what was added or removed here, what was added or removed there,
//      against the snapshot of the last sync), then fetches the photos and PDFs it does not have,
//   3. uploads what only it has (drive.js), and writes the merged snapshot back.
//
// Merging never loses work: something is removed only when the other device removed it AND nothing new was put
// into it here since; an item in both places is merged field by field (the more recent change wins, children are
// merged one by one); two empty "sample" courses created on two fresh devices are not duplicated.
//
// This file is pure (no network, no storage): see drive.js for the transport and tests/cloud-sync.test.mjs.
//
//   CloudSync.structureOf(state)          → the part of the state that is shared between devices
//   CloudSync.merge(state, remote, base)  → merges `remote` (a snapshot) into `state` IN PLACE (open screens keep
//                                           their objects); returns {changed, newPhotos, newPdfs, droppedPhotos}
//   CloudSync.snapshot(state, photoMeta, pdfMeta, at) → what is written to Drive

const CloudSync=(()=>{
  const clone=v=>JSON.parse(JSON.stringify(v));
  const isPlain=v=>v===null||typeof v!=='object';
  const retain=(arr,keep)=>{const k=arr.filter(keep);arr.splice(0,arr.length,...k)};   // filter in place: open screens keep their array

  // The shared part of a state. Settings, camera memory, filters, profile stay on the device.
  function structureOf(state){
    return{
      courses:clone(state.courses||[]),
      inbox:clone((state.inbox||[]).map(b=>({id:b.id,title:b.title,photoIds:[...(b.photoIds||[])],createdAt:b.createdAt}))),
      files:clone(state.files||[]),
      favorites:[...(state.favorites||[])],
      timetable:clone(Array.isArray(state.timetable)?state.timetable:[])
    };
  }

  // ─── three-way merge of lists, in place ───
  // Lists of ids (the photos of a séance, favourites). Order: the winning side's first.
  function mergeIds(local,remote,base,winner){
    const L=new Set(local),R=new Set(remote),B=new Set(base),out=[],seen=new Set();
    for(const id of winner==='remote'?[...remote,...local]:[...local,...remote]){
      if(seen.has(id))continue;seen.add(id);
      const l=L.has(id),r=R.has(id),b=B.has(id);
      if(l&&r)out.push(id);
      else if(!b)out.push(id);        // new here, or new there
      // else: it was in the last snapshot and one side no longer has it: removed on that side
    }
    local.splice(0,local.length,...out);
  }

  // Lists of objects with an id. `merge(l, r, b)` merges one item that exists on both sides; `keep(l)` protects a
  // local item the other device removed (it holds something new that was not in the last snapshot).
  function mergeItems(local,remote,base,winner,{merge,keep=()=>false}){
    const L=new Map(local.map(x=>[x.id,x])),R=new Map(remote.map(x=>[x.id,x])),B=new Map(base.map(x=>[x.id,x]));
    const out=[],seen=new Set();
    for(const x of winner==='remote'?[...remote,...local]:[...local,...remote]){
      const id=x.id;if(seen.has(id))continue;seen.add(id);
      const l=L.get(id),r=R.get(id),b=B.get(id);
      if(l&&r){merge(l,r,b);out.push(l)}
      else if(l){if(!b||keep(l))out.push(l)}            // new here, or removed there (unless it holds something new)
      else if(r){if(!b)out.push(clone(r))}              // new there (removed here: stays removed)
    }
    local.splice(0,local.length,...out);
  }

  // Plain fields of an item: the winning side's value; fields only the other side has are added.
  function assign(l,r,winner,skip){
    for(const k of Object.keys(r)){
      if(skip.includes(k)||!isPlain(r[k]))continue;
      if(winner==='remote'||!(k in l))l[k]=r[k];
    }
  }

  // Every photo id held by a list of containers (courses, séances, batches).
  const sessionsOf=courses=>courses.flatMap(c=>(c.sections||[]).flatMap(s=>s.sessions||[]));
  function photoIdsIn(s){
    const ids=new Set();
    for(const q of sessionsOf(s.courses||[]))for(const id of q.photoIds||[])ids.add(id);
    for(const b of s.inbox||[])for(const id of b.photoIds||[])ids.add(id);
    return ids;
  }
  const pdfIdsIn=s=>new Set((s.files||[]).map(f=>f.id));

  function merge(state,remote,base,{localModified=0}={}){
    const before=JSON.stringify(structureOf(state)),photosBefore=photoIdsIn(state),pdfsBefore=pdfIdsIn(state);
    const b=base?.s||{courses:[],inbox:[],files:[],favorites:[],timetable:[]},baseAt=base?.at||0;
    const remoteMoved=(remote.updatedAt||0)>baseAt,localMoved=localModified>baseAt;
    // Who wins when both changed the same field: the more recent change.
    const winner=remoteMoved&&(!localMoved||(remote.updatedAt||0)>=localModified)?'remote':'local';
    const known=new Set([...photoIdsIn(b),...Object.keys(remote.photos||{})]);   // photos the account already knew about
    const R={courses:remote.courses||[],inbox:remote.inbox||[],files:remote.files||[],favorites:remote.favorites||[],timetable:remote.timetable||[]};
    if(!Array.isArray(state.courses))state.courses=[];if(!Array.isArray(state.inbox))state.inbox=[];if(!Array.isArray(state.files))state.files=[];
    if(!Array.isArray(state.favorites))state.favorites=[];if(!Array.isArray(state.timetable))state.timetable=[];

    // A local container the other device removed is kept if a photo was put into it here since the last sync.
    const holdsNew=q=>(q.photoIds||[]).some(id=>!known.has(id));
    const mergeSession=(l,r,bs)=>{assign(l,r,winner,['photoIds']);l.photoIds??=[];mergeIds(l.photoIds,r.photoIds||[],bs?.photoIds||[],winner)};
    const mergeSection=(l,r,bs)=>{assign(l,r,winner,['sessions']);l.sessions??=[];mergeItems(l.sessions,r.sessions||[],bs?.sessions||[],winner,{merge:(ls,rs,b2)=>mergeSession(ls,rs,b2),keep:holdsNew})};
    const mergeCourse=(l,r,bc)=>{assign(l,r,winner,['sections']);l.sections??=[];mergeItems(l.sections,r.sections||[],bc?.sections||[],winner,{merge:(ls,rs,b2)=>mergeSection(ls,rs,b2),keep:s=>(s.sessions||[]).some(holdsNew)})};
    const sampleTwin=c=>!(c.sections||[]).some(s=>(s.sessions||[]).length);

    // Two fresh devices each start with empty sample courses (VHDL, Mathématiques, Électronique) with different ids:
    // the empty copy on this device goes when the account already has a course of that name.
    const baseCourseIds=new Set(b.courses.map(c=>c.id)),remoteByName=new Map(R.courses.map(c=>[String(c.name).trim().toLowerCase(),c]));
    const remoteIds=new Set(R.courses.map(c=>c.id));
    retain(state.courses,c=>!(sampleTwin(c)&&!baseCourseIds.has(c.id)&&!remoteIds.has(c.id)&&remoteByName.has(String(c.name).trim().toLowerCase())));

    mergeItems(state.courses,R.courses,b.courses,winner,{merge:mergeCourse,keep:c=>(c.sections||[]).some(s=>(s.sessions||[]).some(holdsNew))});
    mergeItems(state.inbox,R.inbox,b.inbox,winner,{merge:(l,r,bb)=>{assign(l,r,winner,['photoIds']);l.photoIds??=[];mergeIds(l.photoIds,r.photoIds||[],bb?.photoIds||[],winner)},keep:holdsNew});
    retain(state.inbox,x=>x.photoIds.length);
    mergeItems(state.files,R.files,b.files,winner,{merge:(l,r,bb)=>{assign(l,r,winner,['sessionIds']);if(l.sessionIds||r.sessionIds){l.sessionIds??=[];mergeIds(l.sessionIds,r.sessionIds||[],bb?.sessionIds||[],winner)}}});
    mergeIds(state.favorites,R.favorites,b.favorites,winner);
    mergeItems(state.timetable,R.timetable,b.timetable,winner,{merge:(l,r)=>assign(l,r,winner,[])});

    // What no longer exists must not be referred to.
    const courseIds=new Set(state.courses.map(c=>c.id)),sessionIds=new Set(sessionsOf(state.courses).map(q=>q.id));
    retain(state.timetable,t=>courseIds.has(t.courseId));
    retain(state.favorites,id=>courseIds.has(id)||sessionIds.has(id));
    for(const f of state.files)if(Array.isArray(f.sessionIds))f.sessionIds=f.sessionIds.filter(id=>sessionIds.has(id));
    if(state.cameraLast&&!courseIds.has(state.cameraLast.courseId))state.cameraLast=null;

    const photosAfter=photoIdsIn(state),pdfsAfter=pdfIdsIn(state);
    return{
      changed:JSON.stringify(structureOf(state))!==before,
      newPhotos:[...photosAfter].filter(id=>!photosBefore.has(id)&&remote.photos?.[id]),
      newPdfs:[...pdfsAfter].filter(id=>!pdfsBefore.has(id)&&remote.pdfs?.[id]),
      droppedPhotos:[...photosBefore].filter(id=>!photosAfter.has(id))
    };
  }

  // What is written to Drive. `photoMeta` / `pdfMeta`: {id: {d: Drive file id, n: name, p: folder id, e: editedAt, c: createdAt}}
  // for every photo / PDF already in Drive.
  function snapshot(state,photoMeta,pdfMeta,at){
    const s=structureOf(state),ids=photoIdsIn(s),pdfs=pdfIdsIn(s);
    const photos={},files={};
    for(const id of ids)if(photoMeta[id])photos[id]=photoMeta[id];
    for(const id of pdfs)if(pdfMeta[id])files[id]=pdfMeta[id];
    return{v:1,updatedAt:at,...s,photos,pdfs:files};
  }
  // Same content, whatever the time stamp: nothing to write.
  const sameContent=(a,b)=>!!a&&!!b&&JSON.stringify({...a,updatedAt:0,device:undefined})===JSON.stringify({...b,updatedAt:0,device:undefined});

  return{structureOf,merge,snapshot,sameContent,photoIdsIn,pdfIdsIn,clone};
})();
if(typeof window!=='undefined')window.CloudSync=CloudSync;
if(typeof module!=='undefined')module.exports=CloudSync;
