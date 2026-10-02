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
    folderCacheOwner=userId;
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
  async function accessToken(sb){const data=await invoke(sb,'drive-access-token');return data.access_token}
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
    return driveFetch(token,`${UPLOAD}?uploadType=multipart&fields=id,name,parents,webViewLink`,{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});
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
        if(e.status===401){ctx.token=await accessToken(ctx.sb);continue}
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

  async function syncAll({sb,user,state,db,onProgress,documents=null}){
    if(!navigator.onLine||!sb||!user)return {synced:0,pending:0,skipped:true};
    const st=await status(sb,user.id);if(!st.connected)return {synced:0,pending:await pendingCount(state,db,documents),connected:false};
    useFolderCache(user.id);
    const ctx={sb,token:await accessToken(sb)};
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
      const names=pc.kind==='session'?
        ['Holioo',rootYear,pc.course.name,pc.section.name,pc.session.title]:
        ['Holioo',rootYear,'Inbox',new Date(pc.batch.createdAt).toISOString().slice(0,10)];
      const list=pc.kind==='session'?pc.session.photoIds:pc.batch.photoIds;
      const filename=`${String(list.indexOf(p.id)+1).padStart(3,'0')}-${p.id.slice(0,8)}.jpg`;
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
    return {synced,failed,lastError,pending:await pendingCount(state,db,documents),connected:true,email:st.email};
  }
  async function pendingCount(state,db,documents=null){
    let n=0;
    for(const id of photoContexts(state).keys()){const p=await db.get('photos',id);if(p?.blob&&(!p.driveFileId||p.driveNeedsUpdate))n++}
    for(const f of state.files||[]){const row=await db.get('files',f.id);if(row?.blob&&!row.driveFileId)n++}
    if(documents){
      const rootYear=state.profile?.academicYear||'Année universitaire';
      for(const d of await documents(state))if(docNeedsSync(d,await docMeta(db,d),docPath(rootYear,d).join('/')))n++;
    }
    return n;
  }
  window.HoliooDrive={status,connect,disconnect,accessToken,ensureFolder,ensurePath,uploadBlob,moveFile,updateContent,syncAll,pendingCount,safeName};
})();
