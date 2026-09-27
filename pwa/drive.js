(function(){
  'use strict';
  const API='https://www.googleapis.com/drive/v3';
  const UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
  const folderMime='application/vnd.google-apps.folder';
  const escQ=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const safeName=s=>String(s||'Sans titre').replace(/[\\/:*?"<>|]/g,'-').trim()||'Sans titre';
  let folderCache={};
  try{folderCache=JSON.parse(localStorage.getItem('holioo_drive_folder_cache')||'{}')}catch{}
  const saveCache=()=>localStorage.setItem('holioo_drive_folder_cache',JSON.stringify(folderCache));

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
  async function connect(sb){return invoke(sb,'drive-auth-start')}
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
      if(reasons.some(x=>['storageQuotaExceeded','quotaExceeded','userRateLimitExceeded'].includes(x))||/storage quota|quota exceeded|full/i.test(message))err.code='DRIVE_FULL';
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
  async function fileParents(token,fileId){const d=await driveFetch(token,`${API}/files/${encodeURIComponent(fileId)}?fields=id,parents,webViewLink,name`);return d}
  async function moveFile(token,fileId,parentId,name){
    const info=await fileParents(token,fileId);const remove=(info.parents||[]).filter(x=>x!==parentId).join(',');
    const qs=new URLSearchParams({addParents:parentId,fields:'id,name,parents,webViewLink'});if(remove)qs.set('removeParents',remove);
    const body=name?{name:safeName(name)}:{};
    return driveFetch(token,`${API}/files/${encodeURIComponent(fileId)}?${qs}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
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
  async function syncAll({sb,user,state,db,onProgress}){
    if(!navigator.onLine||!sb||!user)return {synced:0,pending:0,skipped:true};
    const st=await status(sb,user.id);if(!st.connected)return {synced:0,pending:await pendingCount(state,db),connected:false};
    const token=await accessToken(sb);let synced=0;const contexts=photoContexts(state);const photos=await db.all('photos');
    const rootYear=state.profile?.academicYear||'Année universitaire';
    for(const p of photos){
      const ctx=contexts.get(p.id);if(!ctx)continue;
      const names=ctx.kind==='session'?
        ['Holioo',rootYear,ctx.course.name,ctx.section.name,ctx.session.title]:
        ['Holioo',rootYear,'Inbox',new Date(ctx.batch.createdAt).toISOString().slice(0,10)];
      const parentId=await ensurePath(token,names);const filename=`${String((ctx.kind==='session'?ctx.session.photoIds:ctx.batch.photoIds).indexOf(p.id)+1).padStart(3,'0')}-${p.id.slice(0,8)}.jpg`;
      try{
        let remote;
        if(p.driveFileId){
          if(p.driveParentId!==parentId||p.driveName!==filename) remote=await moveFile(token,p.driveFileId,parentId,filename);
          else remote={id:p.driveFileId,parents:[parentId],webViewLink:p.driveWebViewLink,name:p.driveName};
        }else remote=await uploadBlob(token,p.blob,filename,parentId);
        await db.put('photos',{...p,driveFileId:remote.id,driveWebViewLink:remote.webViewLink||p.driveWebViewLink||null,driveParentId:parentId,driveName:filename,syncState:'synced',syncError:null,syncedAt:new Date().toISOString()});
        synced++;onProgress?.({type:'photo',synced});
      }catch(e){const full=e?.code==='DRIVE_FULL';await db.put('photos',{...p,syncState:full?'drive_full':'error',syncError:String(e.message||e)});throw e}
    }
    for(const f of state.files||[]){
      const row=await db.get('files',f.id);if(!row?.blob)continue;
      const course=state.courses.find(c=>c.id===f.courseId);const parentId=await ensurePath(token,['Holioo',rootYear,course?.name||'PDFs','PDFs']);const filename=safeName(f.fileName||`${f.title}.pdf`);
      let remote;
      try{
        if(row.driveFileId){if(row.driveParentId!==parentId||row.driveName!==filename)remote=await moveFile(token,row.driveFileId,parentId,filename);else remote={id:row.driveFileId,webViewLink:row.driveWebViewLink,parents:[parentId],name:row.driveName}}
        else remote=await uploadBlob(token,row.blob,filename,parentId);
        await db.put('files',{...row,driveFileId:remote.id,driveWebViewLink:remote.webViewLink||row.driveWebViewLink||null,driveParentId:parentId,driveName:filename,syncState:'synced',syncError:null,syncedAt:new Date().toISOString()});synced++;onProgress?.({type:'file',synced});
      }catch(e){const full=e?.code==='DRIVE_FULL';await db.put('files',{...row,syncState:full?'drive_full':'error',syncError:String(e.message||e)});throw e}
    }
    return {synced,pending:await pendingCount(state,db),connected:true,email:st.email};
  }
  async function pendingCount(state,db){
    const contexts=photoContexts(state);const photos=await db.all('photos');let n=photos.filter(p=>contexts.has(p.id)&&!p.driveFileId).length;
    for(const f of state.files||[]){const row=await db.get('files',f.id);if(row?.blob&&!row.driveFileId)n++}
    return n;
  }
  window.HoliooDrive={status,connect,disconnect,accessToken,ensureFolder,ensurePath,uploadBlob,moveFile,syncAll,pendingCount,safeName};
})();
