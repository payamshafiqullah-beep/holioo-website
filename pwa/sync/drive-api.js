// Google Drive, API layer: access token, the Drive REST calls, folders and files, the per-account folder-id cache.
(function(){
  'use strict';
  window.HoliooDriveParts=window.HoliooDriveParts||{};
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
  window.HoliooDriveParts.drive_api={clearCache,accessToken,ensurePath,fileInfo,moveFile,updateContent,uploadBlob,driveFetch,API,downloadBlob,findPath,findFile,UPLOAD,context,escQ,status,useFolderCache,safeName,connect,disconnect,forgetToken,ensureFolder};
})();
