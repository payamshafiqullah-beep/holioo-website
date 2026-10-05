// Google Drive, account sync: the shared snapshot (holioo-sync.json), fetching what other devices sent, syncAll and pendingCount. Publishes window.HoliooDrive.
(function(){
  'use strict';
  const {retrying,fatal,photoContexts,photoPlace,pushItem,markSynced,markFailed,docPath,docMeta,docNeedsSync,pushDocument,readState,writeState,downloadFile,pushPhoto,findFileAt,fileMeta,adoptDocument}=window.HoliooDriveParts.drive_items;
  const {ensurePath,escQ,driveFetch,API,updateContent,uploadBlob,status,useFolderCache,accessToken,safeName,connect,disconnect,forgetToken,context,ensureFolder,moveFile}=window.HoliooDriveParts.drive_api;
  // ---------- the account's state, shared between devices (sync/cloud-sync.js) ----------
  // Holioo/holioo-sync.json in Drive holds the courses, séances, Captures, PDFs, favourites and timetable and where
  // every photo / PDF is. A sync reads it first (merging it into this device, then fetching what is missing), then
  // uploads what only this device has, then writes the merged snapshot back. `state.cloud` remembers the snapshot of
  // the last sync (the base of the three-way merge), the manifest's version, and what is still to be fetched.
  const MANIFEST='holioo-sync.json';
  const hash=str=>{let h=0x811c9dc5;for(let i=0;i<str.length;i++)h=Math.imul(h^str.charCodeAt(i),0x01000193);return(h>>>0).toString(36)};
  const contentHash=snap=>hash(JSON.stringify({...snap,updatedAt:0}));
  const manifestFolder=ctx=>retrying(ctx,()=>ensurePath(ctx.token,['Holioo']));
  async function findManifest(ctx,parent){
    const q=`name='${escQ(MANIFEST)}' and '${escQ(parent)}' in parents and trashed=false`;
    const data=await retrying(ctx,()=>driveFetch(ctx.token,`${API}/files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,modifiedTime)&pageSize=5&orderBy=modifiedTime%20desc`));
    return data.files?.[0]||null;
  }
  async function download(ctx,fileId){
    const r=await fetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media`,{headers:{Authorization:`Bearer ${ctx.token}`}});
    if(!r.ok){const e=new Error(`Google Drive ${r.status}`);e.status=r.status;throw e}
    return r;
  }
  const cloudBlob=(ctx,id)=>retrying(ctx,async()=>(await download(ctx,id)).blob());
  const downloadJson=(ctx,id)=>retrying(ctx,async()=>JSON.parse(await(await download(ctx,id)).text()));

  async function fetchMissing(ctx,{state,db,save,onProgress}){
    const cs=state.cloud;let received=0,failed=0;
    const jobs=[...(cs.pending||[]).map(id=>['photos',id]),...(cs.pendingPdfs||[]).map(id=>['files',id])];
    if(!jobs.length)return{received,failed};
    let i=0,done=0;
    const settle=(store,id)=>{const k=store==='photos'?'pending':'pendingPdfs';cs[k]=(cs[k]||[]).filter(x=>x!==id)};
    async function worker(){
      while(i<jobs.length){
        const[store,id]=jobs[i++];
        try{
          const row=await db.get(store,id);
          if(!row||row.blob){settle(store,id)}                                // gone, or already here
          else{
            const blob=await cloudBlob(ctx,row.driveFileId);
            // Written into the latest version of the row (the person may have used the photo meanwhile).
            await db.patch(store,id,{blob,placeholder:false});settle(store,id);received++;
          }
        }catch(e){
          if(e.status===404)settle(store,id);                                 // no longer in Drive: nothing to wait for
          else if(fatal(e))throw e;
          else failed++;                                                      // network trouble: tried again next time
        }
        onProgress?.({checked:++done,total:jobs.length,synced:0,phase:'pull'});
      }
    }
    await Promise.all([worker(),worker(),worker()]);
    save?.();
    return{received,failed};
  }

  // Reads the snapshot, merges it into `state` (in place), keeps rows for what has to be fetched, fetches it.
  async function cloudPull(ctx,{state,db,cloud,save,onProgress}){
    const cs=state.cloud??={};
    const parent=await manifestFolder(ctx),meta=await findManifest(ctx,parent);
    let changed=false;
    if(meta&&(meta.id!==cs.id||meta.modifiedTime!==cs.modifiedTime)){
      const remote=await downloadJson(ctx,meta.id);
      if(remote&&remote.v===1){
        const r=cloud.merge(state,remote,cs.base,{localModified:state.lastModified||0});
        changed=r.changed;
        // Photos / PDFs this account has that this device has no row for yet: a placeholder (with where to fetch it).
        const stored=new Set(await db.keys('photos')),storedPdfs=new Set(await db.keys('files')),now=new Date().toISOString();
        const wantPhotos=[...cloud.photoIdsIn(state)].filter(id=>remote.photos?.[id]&&!stored.has(id));
        const wantPdfs=[...cloud.pdfIdsIn(state)].filter(id=>remote.pdfs?.[id]&&!storedPdfs.has(id));
        const placeholder=(id,m)=>({id,placeholder:true,fromCloud:true,createdAt:m.c||now,editedAt:m.e||null,driveFileId:m.d,driveParentId:m.p||null,driveName:m.n||null,syncState:'synced'});
        for(const id of wantPhotos)await db.put('photos',placeholder(id,remote.photos[id]));
        for(const id of wantPdfs)await db.put('files',placeholder(id,remote.pdfs[id]));
        cs.pending=[...new Set([...(cs.pending||[]),...wantPhotos])];cs.pendingPdfs=[...new Set([...(cs.pendingPdfs||[]),...wantPdfs])];
        // Photos the other device deleted: their copy here goes too (otherwise "photos found" would bring them back).
        for(const id of r.droppedPhotos){await db.del('photos',id).catch(()=>{});await db.del('kv',`ocr:${id}`).catch(()=>{});cs.pending=cs.pending.filter(x=>x!==id)}
        cs.id=meta.id;cs.modifiedTime=meta.modifiedTime;cs.hash=contentHash(remote);
        save?.();
      }
    }
    const got=await fetchMissing(ctx,{state,db,save,onProgress});
    return{changed,received:got.received,failed:got.failed};
  }

  // Writes the merged snapshot when it differs from what the account has.
  async function cloudPush(ctx,{state,db,cloud,save,onProgress,round=0}){
    const cs=state.cloud??={};
    const parent=await manifestFolder(ctx),meta=await findManifest(ctx,parent);
    // Someone wrote since this sync read it: merge that first, so nothing of theirs is overwritten.
    if(meta&&cs.id&&meta.modifiedTime!==cs.modifiedTime&&round<2){await cloudPull(ctx,{state,db,cloud,save,onProgress});return cloudPush(ctx,{state,db,cloud,save,onProgress,round:round+1})}
    const photoMeta={},pdfMeta={};
    for(const id of cloud.photoIdsIn(state)){const r=await db.get('photos',id);if(r?.driveFileId)photoMeta[id]={d:r.driveFileId,n:r.driveName||null,p:r.driveParentId||null,e:r.editedAt||null,c:r.createdAt||null}}
    for(const id of cloud.pdfIdsIn(state)){const r=await db.get('files',id);if(r?.driveFileId)pdfMeta[id]={d:r.driveFileId,n:r.driveName||null,p:r.driveParentId||null,c:r.createdAt||null}}
    const snap=cloud.snapshot(state,photoMeta,pdfMeta,Date.now()),h=contentHash(snap);
    if(h===cs.hash&&meta){cs.base={s:cloud.structureOf(state),at:Date.now()};save?.();return false}   // the account already has exactly this
    const blob=new Blob([JSON.stringify(snap)],{type:'application/json'});
    let id=meta?.id;
    if(id)await retrying(ctx,()=>updateContent(ctx.token,id,blob));
    else id=(await retrying(ctx,()=>uploadBlob(ctx.token,blob,MANIFEST,parent))).id;
    const info=await retrying(ctx,()=>driveFetch(ctx.token,`${API}/files/${encodeURIComponent(id)}?fields=id,modifiedTime`));
    cs.id=id;cs.modifiedTime=info.modifiedTime;cs.hash=h;cs.base={s:cloud.structureOf(state),at:Date.now()};
    save?.();
    return true;
  }

  // onDocument(d, files): a document was sent (files = {name: {id, parentId, sig}}), e.g. to signal other devices.
  async function syncAll({sb,user,state,db,onProgress,documents=null,cloud=window.CloudSync,save=null,onDocument=null}){
    if(!navigator.onLine||!sb||!user)return {synced:0,pending:0,skipped:true};
    const st=await status(sb,user.id);if(!st.connected)return {synced:0,pending:await pendingCount(state,db,documents),connected:false};
    useFolderCache(user.id);
    const ctx={sb,token:await accessToken(sb)};
    // What other devices of this account have, first: merged in, then the photos and PDFs fetched.
    let pulled={changed:false,received:0,failed:0},cloudError=null;
    if(cloud){
      try{pulled=await cloudPull(ctx,{state,db,cloud,save,onProgress})}
      catch(e){if(fatal(e))throw e;cloudError=e;console.warn('Cloud pull:',e?.message||e)}
    }
    const rootYear=state.profile?.academicYear||'Année universitaire';
    const contexts=photoContexts(state);
    const files=(state.files||[]);
    const docs=documents?await documents(state):[];
    const total=contexts.size+files.length+docs.length;
    let synced=0,failed=0,checked=0,lastError=null;
    const step=()=>{checked++;onProgress?.({checked,total,synced})};

    for(const [id,pc] of contexts){
      const p=await db.get('photos',id);
      if(!p?.blob){step();continue}
      const {names,filename}=photoPlace(state,pc,p);
      try{
        const res=await pushItem(ctx,p,p.rendered||p.blob,names,filename);
        if(res){await markSynced(db,'photos',p,res,filename);synced++}
      }catch(e){
        failed++;lastError=e;await markFailed(db,'photos',p.id,e);
        if(fatal(e))throw e;
      }
      step();
    }
    for(const f of files){
      const row=await db.get('files',f.id);
      if(!row?.blob){step();continue}
      const course=state.courses.find(c=>c.id===f.courseId);const filename=safeName(f.fileName||`${f.title}.pdf`);
      try{
        const res=await pushItem(ctx,row,row.blob,['Holioo',rootYear,course?.name||'PDFs','PDFs'],filename);
        if(res){await markSynced(db,'files',row,res,filename);synced++}
      }catch(e){
        failed++;lastError=e;await markFailed(db,'files',row.id,e);
        if(fatal(e))throw e;
      }
      step();
    }
    for(const d of docs){
      const names=docPath(rootYear,d),meta=await docMeta(db,d);
      if(docNeedsSync(d,meta,names.join('/'))){
        try{if(await pushDocument(ctx,db,d,names,meta)){synced++;try{onDocument?.(d,(await docMeta(db,d))?.files||{})}catch{}}}
        catch(e){
          failed++;lastError=e;
          if(fatal(e))throw e;
        }
      }
      step();
    }
    // Then the merged state goes back, so the other devices find it.
    let pushed=false;
    if(cloud&&!cloudError){
      try{pushed=await cloudPush(ctx,{state,db,cloud,save,onProgress})}
      catch(e){if(fatal(e))throw e;cloudError=e;console.warn('Cloud push:',e?.message||e)}
    }
    return {synced,failed,lastError,pending:await pendingCount(state,db,documents),connected:true,email:st.email,
      received:pulled.received,receivedFailed:pulled.failed,changed:pulled.changed,pushed,cloudError};
  }
  async function pendingCount(state,db,documents=null){
    let n=0;
    for(const id of photoContexts(state).keys()){const p=await db.get('photos',id);if(p?.blob&&(!p.driveFileId||p.driveNeedsUpdate))n++}
    for(const f of state.files||[]){const row=await db.get('files',f.id);if(row?.blob&&!row.driveFileId)n++}
    n+=(state.cloud?.pending?.length||0)+(state.cloud?.pendingPdfs?.length||0);   // still to fetch from the account
    if(documents){
      const rootYear=state.profile?.academicYear||'Année universitaire';
      for(const d of await documents(state))if(docNeedsSync(d,await docMeta(db,d),docPath(rootYear,d).join('/')))n++;
    }
    return n;
  }
  window.HoliooDrive={status,connect,disconnect,accessToken,forgetToken,context,readState,writeState,downloadFile,pushPhoto,findFileAt,fileMeta,adoptDocument,ensureFolder,ensurePath,uploadBlob,moveFile,updateContent,syncAll,pendingCount,safeName};
  delete window.HoliooDriveParts;
})();
