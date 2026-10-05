// Google Drive, items: where a photo / PDF / document goes, pushing and replacing files, the shared state.json, multi-file documents.
(function(){
  'use strict';
  const {clearCache,accessToken,ensurePath,fileInfo,moveFile,updateContent,uploadBlob,driveFetch,API,downloadBlob,findPath,findFile,UPLOAD,context}=window.HoliooDriveParts.drive_api;
  function photoPlace(state,pc,p){
    const rootYear=state.profile?.academicYear||'Année universitaire';
    const names=pc.kind==='session'?
      ['Holioo',rootYear,pc.course.name,pc.section.name,pc.session.title]:
      ['Holioo',rootYear,'Inbox',new Date(pc.batch.createdAt).toISOString().slice(0,10)];
    const list=pc.kind==='session'?pc.session.photoIds:pc.batch.photoIds;
    return{names,filename:`${String(list.indexOf(p.id)+1).padStart(3,'0')}-${p.id.slice(0,8)}.jpg`};
  }
  function photoContexts(state){
    const map=new Map();
    for(const batch of state.inbox||[]) for(const id of batch.photoIds||[]) if(!map.has(id)) map.set(id,{kind:'inbox',batch});
    for(const course of state.courses||[]) for(const section of course.sections||[]) for(const session of section.sessions||[]) for(const id of session.photoIds||[]) map.set(id,{kind:'session',course,section,session});
    return map;
  }

  // Runs one Drive step; retried once after a stale folder id (404) or an expired access token (401).
  async function retrying(ctx,fn){
    for(let attempt=0;;attempt++){
      try{return await fn()}
      catch(e){
        if(attempt>0)throw e;
        // A folder deleted in Drive leaves a stale id in the cache: forget the cache and retry once.
        if(e.status===404){clearCache();continue}
        // The access token expired during a long sync: get a new one and retry once.
        if(e.status===401){ctx.token=await accessToken(ctx.sb,{force:true});continue}
        throw e;
      }
    }
  }
  const blobOf=b=>typeof b==='function'?b():b;   // made only when it is really sent

  // Puts one local item in its Drive folder. Returns null when Drive is already up to date.
  // A photo already in Drive is moved/renamed (or its content replaced after an edit), never uploaded twice.
  async function pushItem(ctx,row,blob,names,filename){
    return retrying(ctx,async()=>{
      const parentId=await ensurePath(ctx.token,names);
      const placed=row.driveFileId&&row.driveParentId===parentId&&row.driveName===filename;
      if(placed&&!row.driveNeedsUpdate)return null;
      let info=null;
      if(row.driveFileId){
        try{info=await fileInfo(ctx.token,row.driveFileId)}catch(e){if(e.status!==404)throw e}
      }
      let remote;
      if(info&&!info.trashed){
        remote=placed?info:await moveFile(ctx.token,row.driveFileId,parentId,filename,info);
        if(row.driveNeedsUpdate)remote=await updateContent(ctx.token,row.driveFileId,await blobOf(blob));
      }else{
        // Never uploaded, or deleted from Drive since: Drive keeps a copy of everything in Holioo.
        remote=await uploadBlob(ctx.token,await blobOf(blob),filename,parentId);
      }
      return{remote,parentId};
    });
  }
  async function trashFile(ctx,fileId){
    try{await retrying(ctx,()=>driveFetch(ctx.token,`${API}/files/${encodeURIComponent(fileId)}?fields=id`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})}))}
    catch(e){if(e.status!==404)throw e}
  }

  // A file made by Holioo on any device of this account (drive.file), e.g. a photo taken on the phone.
  const downloadFile=(ctx,fileId)=>retrying(ctx,()=>downloadBlob(ctx.token,fileId));

  // A file Holioo put in a folder (e.g. a séance's Notes.json written by another device): {id, md5, parentId} or null.
  async function findFileAt(ctx,names,name){
    return retrying(ctx,async()=>{
      const parent=await findPath(ctx.token,names);if(!parent)return null;
      const f=await findFile(ctx.token,name,parent);return f?{id:f.id,md5:f.md5Checksum||null,parentId:parent}:null;
    });
  }
  async function fileMeta(ctx,fileId){
    return retrying(ctx,()=>driveFetch(ctx.token,`${API}/files/${encodeURIComponent(fileId)}?fields=id,parents,md5Checksum,trashed`));
  }
  // A document read from Drive (made on another device) is remembered as already sent, so this device
  // replaces that same file next time instead of uploading a second copy.
  async function adoptDocument(db,{id,version,folder},rootYear,files){
    await db.put('kv',{key:docMetaKey({id}),meta:{version,path:docPath(rootYear,{folder}).join('/'),files}});
  }

  // The course structure shared by the devices of an account: Holioo/.holioo/state.json in the user's Drive.
  // `meta` = {id, md5} of what this device last read or wrote; an unchanged file is not downloaded again.
  const STATE_PATH=['Holioo','.holioo'],STATE_NAME='state.json';
  async function readState(ctx,meta={}){
    return retrying(ctx,async()=>{
      let info=null;
      if(meta.id){
        try{info=await driveFetch(ctx.token,`${API}/files/${encodeURIComponent(meta.id)}?fields=id,md5Checksum,trashed`)}catch(e){if(e.status!==404)throw e}
        if(info?.trashed)info=null;
      }
      if(!info){const parent=await findPath(ctx.token,STATE_PATH);info=parent?await findFile(ctx.token,STATE_NAME,parent):null}
      if(!info)return{id:null,md5:null,data:null};
      if(info.md5Checksum&&info.md5Checksum===meta.md5)return{id:info.id,md5:info.md5Checksum,data:null};
      const text=await(await downloadBlob(ctx.token,info.id)).text();
      let data=null;try{data=JSON.parse(text)}catch{}
      return{id:info.id,md5:info.md5Checksum||null,data};
    });
  }
  async function writeState(ctx,doc,meta={}){
    const blob=new Blob([JSON.stringify(doc)],{type:'application/json'});
    return retrying(ctx,async()=>{
      let r=null;
      if(meta.id){
        try{r=await driveFetch(ctx.token,`${UPLOAD}/${encodeURIComponent(meta.id)}?uploadType=media&fields=id,md5Checksum`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:blob})}
        catch(e){if(e.status!==404)throw e}
      }
      if(!r){const up=await uploadBlob(ctx.token,blob,STATE_NAME,await ensurePath(ctx.token,STATE_PATH));r={id:up.id,md5Checksum:up.md5Checksum}}
      return{id:r.id,md5:r.md5Checksum||null};
    });
  }

  // Sends one photo now (Live Capture), without waiting for a full sync. Returns its Drive file id.
  async function pushPhoto({sb,user,state,db,id}){
    const ctx=await context(sb,user.id);
    const p=await db.get('photos',id);if(!p?.blob)return null;
    const pc=photoContexts(state).get(id);if(!pc)return null;
    const {names,filename}=photoPlace(state,pc,p);
    const res=await pushItem(ctx,p,p.rendered||p.blob,names,filename);
    if(res){await markSynced(db,'photos',p,res,filename);return res.remote.id}
    return p.driveFileId||null;
  }

  // Documents made of several files in one folder (a session's notebook: one image per written page + its data),
  // given by the app as {id, version, empty, folder:[course, section, session], parts()}; parts() → [{name, sig, blob}].
  // What was sent is remembered in kv `drive:<id>`: a file is replaced in place only when its sig changed, moved
  // when the folder was renamed, and sent to the Drive trash when the document no longer has it.
  const docMetaKey=d=>`drive:${d.id}`;
  const docPath=(rootYear,d)=>['Holioo',rootYear,...d.folder];
  const docNeedsSync=(d,meta,path)=>meta?meta.version!==d.version||meta.path!==path:!d.empty;
  async function docMeta(db,d){try{return(await db.get('kv',docMetaKey(d)))?.meta||null}catch{return null}}
  async function pushDocument(ctx,db,d,names,meta){
    const parts=await d.parts(),old=meta?.files||{},files={};
    if(!parts.length&&!Object.keys(old).length){await db.put('kv',{key:docMetaKey(d),meta:{version:d.version,path:names.join('/'),files}});return false}
    const parentId=parts.length?await retrying(ctx,()=>ensurePath(ctx.token,names)):null;   // nothing left to send: only the trash
    let changed=false,done=false;
    try{
      for(const part of parts){
        const prev=old[part.name];
        if(prev&&prev.sig===part.sig&&prev.parentId===parentId){files[part.name]=prev;continue}
        const res=await pushItem(ctx,{driveFileId:prev?.id,driveParentId:prev?.parentId,driveName:part.name,driveNeedsUpdate:!!prev&&prev.sig!==part.sig},part.blob,names,part.name);
        files[part.name]={id:res?res.remote.id:prev.id,parentId:res?res.parentId:parentId,sig:part.sig};changed=true;
      }
      for(const[name,file]of Object.entries(old))if(!files[name]){await trashFile(ctx,file.id);changed=true}
      done=true;
    }finally{
      // Files already sent are remembered even after a failure, so they are never uploaded twice.
      const meta2=done?{version:d.version,path:names.join('/'),files}:{version:meta?.version??null,path:meta?.path??null,files:{...old,...files}};
      await db.put('kv',{key:docMetaKey(d),meta:meta2}).catch(()=>{});
    }
    return changed;
  }

  // Result written back into the latest version of the row (the user may have edited it meanwhile).
  async function markSynced(db,store,row,{remote,parentId},filename){
    await db.patch(store,row.id,latest=>{
      const changedMeanwhile=latest.editedAt!==row.editedAt;
      return{driveFileId:remote.id,driveWebViewLink:remote.webViewLink||latest.driveWebViewLink||null,driveParentId:parentId,driveName:filename,
        driveNeedsUpdate:changedMeanwhile?!!latest.driveNeedsUpdate:false,syncState:changedMeanwhile?'pending':'synced',syncError:null,syncedAt:new Date().toISOString()};
    });
  }
  const markFailed=(db,store,id,e)=>db.patch(store,id,{syncState:e?.code==='DRIVE_FULL'?'drive_full':'error',syncError:String(e?.message||e)}).catch(()=>{});
  // Errors that would fail the same way for every other item: stop and report.
  const fatal=e=>e?.code==='DRIVE_FULL'||e?.code==='RATE_LIMIT'||e?.status===401||e?.status===403;

  window.HoliooDriveParts.drive_items={retrying,fatal,photoContexts,photoPlace,pushItem,markSynced,markFailed,docPath,docMeta,docNeedsSync,pushDocument,readState,writeState,downloadFile,pushPhoto,findFileAt,fileMeta,adoptDocument};
})();
