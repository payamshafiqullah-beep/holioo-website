(function(){
  'use strict';
  const API='https://www.googleapis.com/drive/v3';
  const UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
  const folderMime='application/vnd.google-apps.folder';
  const escQ=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const safeName=s=>String(s||'Sans titre').replace(/[\\/:*?"<>|]/g,'-').trim()||'Sans titre';

  // Drive folder ids, remembered per Google account (two accounts on one device never share them).
  let folderCache={},folderCacheOwner=null;
  const cacheKey=()=>`holioo_drive_folder_cache:${folderCacheOwner}`;
  try{localStorage.removeItem('holioo_drive_folder_cache')}catch{} // old cache shared by all accounts
  function useFolderCache(userId){
    if(folderCacheOwner===userId)return;
    folderCacheOwner=userId;cachedToken=null;
    try{folderCache=JSON.parse(localStorage.getItem(cacheKey())||'{}')}catch{folderCache={}}
  }
  const saveCache=()=>{try{localStorage.setItem(cacheKey(),JSON.stringify(folderCache))}catch{}};
  const clearCache=()=>{folderCache={};saveCache()};

  async function invoke(sb,name,body={}){
    const {data,error}=await sb.functions.invoke(name,{body});
    if(error) throw error;
    if(data?.error) throw new Error(data.error);
    return data;
  }
  async function status(sb,userId){
    if(!sb||!userId) return {connected:false,email:null};
    const {data,error}=await sb.from('drive_status').select('*').eq('user_id',userId).maybeSingle();
    if(error) throw error;
    return data||{connected:false,email:null};
  }
  async function connect(sb,returnTo){return invoke(sb,'drive-auth-start',{return_to:returnTo})}
  async function disconnect(sb){return invoke(sb,'drive-disconnect')}
  // Short-lived Drive access token (minted server-side from the refresh token), kept in memory until a minute
  // before it expires: a tablet page open for hours keeps working without a new token for every request.
  let cachedToken=null;
  async function accessToken(sb,{force=false}={}){
    if(!force&&cachedToken?.sb===sb&&Date.now()<cachedToken.exp-60000)return cachedToken.value;
    const data=await invoke(sb,'drive-access-token');
    cachedToken={sb,value:data.access_token,exp:Date.now()+(Number(data.expires_in)||3600)*1000};
    return cachedToken.value;
  }
  const forgetToken=()=>{cachedToken=null};
  async function context(sb,userId){useFolderCache(userId);return{sb,token:await accessToken(sb)}}
  async function driveFetch(token,url,options={}){
    const headers=new Headers(options.headers||{});headers.set('Authorization',`Bearer ${token}`);
    const r=await fetch(url,{...options,headers});
    const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
    if(!r.ok){
      const message=data.error?.message||data.error_description||data.error||`Google Drive ${r.status}`;
      const reasons=(data.error?.errors||[]).map(x=>x.reason).filter(Boolean);
      const err=new Error(message);err.status=r.status;err.driveReasons=reasons;
      if(reasons.includes('storageQuotaExceeded')||/storage quota|drive.*full/i.test(message))err.code='DRIVE_FULL';
      else if(r.status===429||reasons.some(x=>['rateLimitExceeded','userRateLimitExceeded','quotaExceeded','dailyLimitExceeded'].includes(x)))err.code='RATE_LIMIT';
      throw err;
    }
    return data;
  }
  async function findFolder(token,name,parentId){
    const key=`${parentId||'root'}::${name}`;if(folderCache[key])return folderCache[key];
    let q=`mimeType='${folderMime}' and name='${escQ(name)}' and trashed=false`;
    q+=` and '${escQ(parentId||'root')}' in parents`;
    const u=`${API}/files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,name,parents)&pageSize=20`;
    const data=await driveFetch(token,u);
    const id=data.files?.[0]?.id;if(id){folderCache[key]=id;saveCache();return id}return null;
  }
  async function createFolder(token,name,parentId){
    const body={name:safeName(name),mimeType:folderMime,parents:[parentId||'root']};
    const data=await driveFetch(token,`${API}/files?fields=id,name,parents,webViewLink`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const key=`${parentId||'root'}::${name}`;folderCache[key]=data.id;saveCache();return data.id;
  }
  async function ensureFolder(token,name,parentId){return await findFolder(token,name,parentId)||await createFolder(token,name,parentId)}
  async function ensurePath(token,names){let parent='root';for(const n of names.filter(Boolean))parent=await ensureFolder(token,safeName(n),parent);return parent}
  // Same path, without creating anything: null when a folder is missing.
  async function findPath(token,names){let parent='root';for(const n of names.filter(Boolean)){parent=await findFolder(token,safeName(n),parent);if(!parent)return null}return parent}
  async function findFile(token,name,parentId){
    const q=`name='${escQ(name)}' and '${escQ(parentId)}' in parents and trashed=false and mimeType!='${folderMime}'`;
    const data=await driveFetch(token,`${API}/files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,md5Checksum)&orderBy=createdTime&pageSize=5`);
    return data.files?.[0]||null;
  }
  async function downloadBlob(token,fileId){
    const r=await fetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media`,{headers:{Authorization:`Bearer ${token}`}});
    if(!r.ok){const err=new Error(`Google Drive ${r.status}`);err.status=r.status;throw err}
    return r.blob();
  }
  async function fileInfo(token,fileId){return driveFetch(token,`${API}/files/${encodeURIComponent(fileId)}?fields=id,parents,webViewLink,name,trashed`)}
  async function moveFile(token,fileId,parentId,name,info){
    info??=await fileInfo(token,fileId);const remove=(info.parents||[]).filter(x=>x!==parentId).join(',');
    const qs=new URLSearchParams({addParents:parentId,fields:'id,name,parents,webViewLink'});if(remove)qs.set('removeParents',remove);
    const body=name?{name:safeName(name)}:{};
    return driveFetch(token,`${API}/files/${encodeURIComponent(fileId)}?${qs}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  }
  // Replaces the content of an existing file (an edited photo): same file, never a duplicate.
  async function updateContent(token,fileId,blob){
    return driveFetch(token,`${UPLOAD}/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,parents,webViewLink`,{method:'PATCH',headers:{'Content-Type':blob.type||'application/octet-stream'},body:blob});
  }
  async function uploadBlob(token,blob,name,parentId){
    const boundary=`holioo_${Math.random().toString(36).slice(2)}`;
    const meta=JSON.stringify({name:safeName(name),parents:[parentId]});
    const enc=new TextEncoder();
    const a=enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${blob.type||'application/octet-stream'}\r\n\r\n`);
    const b=enc.encode(`\r\n--${boundary}--`);
    const body=new Blob([a,blob,b],{type:`multipart/related; boundary=${boundary}`});
    return driveFetch(token,`${UPLOAD}?uploadType=multipart&fields=id,name,parents,webViewLink,md5Checksum`,{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});
  }
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

  // ---------- the account's state, shared between devices (features/cloud-sync.js) ----------
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
  const downloadBlob=(ctx,id)=>retrying(ctx,async()=>(await download(ctx,id)).blob());
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
            const blob=await downloadBlob(ctx,row.driveFileId);
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

  async function syncAll({sb,user,state,db,onProgress,documents=null,cloud=window.CloudSync,save=null}){
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
        try{if(await pushDocument(ctx,db,d,names,meta))synced++}
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
  window.HoliooDrive={status,connect,disconnect,accessToken,forgetToken,context,readState,writeState,downloadFile,pushPhoto,ensureFolder,ensurePath,uploadBlob,moveFile,updateContent,syncAll,pendingCount,safeName};
})();
