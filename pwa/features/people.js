// People + Holioo Shares: add someone by their exact Holioo ID, share a document with them (view-only), revoke.
// Privacy model (supabase/migrations/20261004120000_people_and_shares.sql):
//  - a person is only ever seen as {uid, holioo_id, display_name, avatar_url} (table public_profiles — no e-mail);
//  - the lookup is ONE exact-match RPC, never a list or a prefix search;
//  - connections (my list of people) are private to me; adding is instant and two-way (RPC add_friend: no request, no approval);
//  - a share = a row per (document, recipient) + files in the PRIVATE bucket `shared-items`, readable only by the owner
//    and by a recipient of a share that lists that file; the recipient cannot share onward; the owner revokes.

const SHARE_BUCKET='shared-items';
const SHARE_MAX_BYTES=25*1024*1024;
let peopleCache=null; // [{uid,holioo_id,display_name,avatar_url,since}] — filled by loadPeople()

const personName=p=>p?.display_name||'Étudiant';
// Initials (first letters of the first two words) on a colour that depends on the person, so two people without a photo differ.
function initialsOf(name){const w=String(name||'?').trim().split(/\s+/).filter(Boolean);return((w[0]?.[0]||'?')+(w.length>1?w[w.length-1][0]:'')).toUpperCase()}
function avatarTone(key){let h=0;for(const c of String(key||''))h=(h*31+c.charCodeAt(0))>>>0;return h%6}
function peopleAvatar(p,cls=''){
  const ini=esc(initialsOf(personName(p)));
  return`<span class="ppl-avatar ${cls}" data-tone="${avatarTone(p?.uid||personName(p))}" data-initials="${ini}">${p?.avatar_url?`<img src="${esc(p.avatar_url)}" alt="" loading="lazy" draggable="false" referrerpolicy="no-referrer">`:ini}</span>`;
}
// A photo that fails to load falls back to the initials (capture phase: image errors do not bubble).
document.addEventListener('error',e=>{const i=e.target;if(i?.tagName==='IMG'&&i.parentElement?.classList.contains('ppl-avatar'))i.parentElement.textContent=i.parentElement.dataset.initials||'?'},true);
// What to tell the user for a failed call: offline, rate limit, or a server that does not have the feature yet.
function peopleErrorText(e){
  const m=String(e?.message||'')+' '+String(e?.code||'');
  if(!navigator.onLine)return'Connexion Internet nécessaire.';
  if(/rate_limited/.test(m))return'Trop de recherches. Réessayez dans une minute.';
  if(/PGRST20[25]|42P01|42883|does not exist|schema cache/i.test(m))return'Cette fonction sera disponible dès que le serveur sera mis à jour.';
  return'Une erreur est survenue. Réessayez.';
}
const peopleErrorHtml=(e,retryId='pplRetry')=>`<div class="ppl-error" role="alert">${icon('info',{size:18})}<span>${esc(peopleErrorText(e))}</span><button class="action-btn ghost ppl-retry" type="button" id="${retryId}">Réessayer</button></div>`;
const peopleSkeleton=(n=3)=>`<div class="ppl-list" aria-busy="true" aria-label="Chargement">${Array.from({length:n},()=>'<div class="ppl-row ppl-skel"><span class="ppl-avatar"></span><span class="ppl-copy"><i></i><i class="short"></i></span></div>').join('')}</div>`;
const peopleReady=()=>!!(sb&&currentUser&&navigator.onLine);
function needOnline(){if(!peopleReady()){showToast('Connexion Internet nécessaire');return false}return true}

// ---------- copy my Holioo ID ----------
async function copyHoliooId(id=state.profile.holiooId){
  if(!id)return false;
  let ok=false;
  try{await navigator.clipboard.writeText(id);ok=true}catch{
    try{const t=document.createElement('textarea');t.value=id;t.setAttribute('readonly','');t.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.append(t);t.select();ok=document.execCommand('copy');t.remove()}catch{}
  }
  showToast(ok?'Identifiant copié':'Copie impossible');
  return ok;
}

// ---------- people ----------
async function loadPeople(){
  if(!peopleReady())return peopleCache||[];
  const{data:links,error}=await sb.from('connections').select('person_id,created_at').order('created_at',{ascending:false});
  if(error)throw error;
  if(!links?.length){peopleCache=[];return peopleCache}
  const{data:profiles,error:e2}=await sb.from('public_profiles').select('uid,holioo_id,display_name,avatar_url').in('uid',links.map(l=>l.person_id));
  if(e2)throw e2;
  const by=new Map((profiles||[]).map(p=>[p.uid,p]));
  peopleCache=links.filter(l=>by.has(l.person_id)).map(l=>({...by.get(l.person_id),since:l.created_at}))
    .sort((a,b)=>personName(a).localeCompare(personName(b),'fr',{sensitivity:'base'}));
  return peopleCache;
}
async function findPerson(rawId){
  const id=String(rawId||'').trim().replace(/^@/,'').toLowerCase();
  if(id.length<4)return null;
  const{data,error}=await sb.rpc('find_holioo_person',{p_holioo_id:id});
  if(error)throw error;
  return data?.[0]||null;
}
async function addPerson(uidToAdd){
  // Two-way at once (RPC add_friend): both people get each other in their list, no request, no approval. Already friends = fine.
  const{error}=await sb.rpc('add_friend',{p_uid:uidToAdd});
  if(error)throw error;
  peopleCache=null;
}
async function removePerson(person){
  // Removing someone also withdraws what was shared with them.
  const{data:rows}=await sb.from('shares').select('id,paths').eq('owner_id',currentUser.id).eq('recipient_id',person.uid);
  for(const r of rows||[])await revokeShare(r);
  const{error}=await sb.rpc('remove_friend',{p_uid:person.uid});   // ends the link on both sides
  if(error)throw error;
  peopleCache=null;
}

// Exact-ID search sheet: shows ONLY name + photo + Add. `after` runs when the list changed.
function openPeopleSearchSheet(after=()=>{},{prefill='',autoSearch=false}={}){
  const close=openSheet({title:'Ajouter une personne',subtitle:'Saisissez son identifiant Holioo exact.',
    body:`<div class="field"><label for="holiooLookup">Identifiant Holioo</label><input id="holiooLookup" type="text" inputmode="text" autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Ex. h1234567890" maxlength="41" value="${esc(prefill)}"></div><div id="pplFound" class="ppl-found" aria-live="polite"></div>`,
    confirmText:'Rechercher',secondaryText:'Fermer',
    onConfirm:async()=>{
      const box=byId('pplFound');if(!needOnline())return false;
      const raw=byId('holiooLookup').value;
      if(String(raw).trim().replace(/^@/,'').length<4){box.innerHTML='<p class="ppl-note">Saisissez l’identifiant en entier.</p>';return false}
      box.innerHTML='<p class="ppl-note">Recherche…</p>';
      try{
        const p=await findPerson(raw);
        if(!p){box.innerHTML='<p class="ppl-note">Aucune personne avec cet identifiant.</p>';return false}
        const me=p.uid===currentUser.id,known=(peopleCache||await loadPeople()).some(x=>x.uid===p.uid);
        box.innerHTML=`<div class="ppl-row">${peopleAvatar(p,'lg')}<span class="ppl-copy"><strong>${esc(personName(p))}</strong></span>${me?'<span class="ppl-tag">Vous</span>':known?`<span class="ppl-tag">${icon('check',{size:14})}Ajouté</span>`:`<button class="action-btn primary ppl-add" id="pplAdd" type="button">${icon('plus',{size:18})}<span>Ajouter</span></button>`}</div>`;
        byId('pplAdd')?.addEventListener('click',async e=>{
          const b=e.currentTarget;b.disabled=true;
          try{await addPerson(p.uid);showToast(`${personName(p)} ajouté(e)`);close();after()}
          catch(err){console.error(err);b.disabled=false;showToast('Ajout impossible')}
        });
      }catch(err){console.error(err);box.innerHTML=`<p class="ppl-note">${esc(peopleErrorText(err))}</p>`}
      return false; // the sheet stays open to show the result
    }});
  setTimeout(()=>{byId('holiooLookup')?.focus();if(autoSearch&&prefill)byId('sheetConfirm')?.click()},50);
  byId('holiooLookup')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();byId('sheetConfirm')?.click()}});
  return close;
}

// ---------- sharing (owner side) ----------
const shareKindLabel=k=>k==='pdf'?'PDF':'Photos';
const shareMetaLine=s=>[shareKindLabel(s.kind),s.section,s.course].filter(Boolean).join(' · ');
const safeShareName=n=>String(n||'fichier').normalize('NFKD').replace(/[^\w.\-]+/g,'_').slice(0,80)||'fichier';

// spec = {kind:'pdf'|'photos', title, course, section, files:async()=>[{blob,name}]}
async function shareWithPeople(spec){
  if(guestMode||!currentUser){showToast('Connectez-vous avec Google pour partager');return}
  if(!needOnline())return;
  let people;
  try{people=await loadPeople()}catch(e){console.error(e);showToast('Liste de personnes indisponible');return}
  if(!people.length){
    openSheet({title:'Aucune personne ajoutée',subtitle:'Ajoutez d’abord un ami avec son identifiant Holioo.',body:'',confirmText:'Ajouter une personne',onConfirm:()=>{openPeopleSearchSheet(()=>shareWithPeople(spec));return false}});
    return;
  }
  const picked=new Set();
  const rows=people.map(p=>`<label class="ppl-row ppl-pick">${peopleAvatar(p)}<span class="ppl-copy"><strong>${esc(personName(p))}</strong></span><input type="checkbox" class="switch ppl-check" data-uid="${esc(p.uid)}" aria-label="Partager avec ${esc(personName(p))}"></label>`).join('');
  let busy=false;
  openSheet({title:'Partager avec des personnes Holioo',subtitle:`« ${spec.title} » — lecture seule dans Holioo, sans repartage possible. Vous pouvez retirer l’accès à tout moment.`,
    body:`<div class="ppl-list ppl-list-sheet">${rows}</div>`,confirmText:'Partager',
    onConfirm:async close=>{
      if(busy)return false;
      sheetRoot.querySelectorAll('.ppl-check').forEach(c=>{if(c.checked)picked.add(c.dataset.uid);else picked.delete(c.dataset.uid)});
      if(!picked.size){showToast('Choisissez au moins une personne');return false}
      busy=true;const btn=byId('sheetConfirm');btn.disabled=true;btn.textContent='Envoi…';
      try{
        const n=await uploadAndShare(spec,[...picked]);
        close();showToast(n===1?'Partagé':`Partagé avec ${n} personnes`);return false;
      }catch(e){console.error(e);busy=false;btn.disabled=false;btn.textContent='Partager';showToast(e?.message==='TOO_BIG'?'Fichier trop volumineux (25 Mo max.)':'Partage impossible');return false}
    }});
}

async function uploadAndShare(spec,recipientIds){
  const files=await spec.files();
  if(!files.length)throw new Error('EMPTY');
  if(files.some(f=>f.blob.size>SHARE_MAX_BYTES))throw new Error('TOO_BIG');
  const key=uid(),paths=[];
  try{
    for(let i=0;i<files.length;i++){
      const f=files[i],path=`${currentUser.id}/${key}/${String(i+1).padStart(2,'0')}-${safeShareName(f.name)}`;
      const{error}=await sb.storage.from(SHARE_BUCKET).upload(path,f.blob,{contentType:f.blob.type||(spec.kind==='pdf'?'application/pdf':'image/jpeg'),upsert:false,cacheControl:'0'});
      if(error)throw error;paths.push(path);
    }
    const rows=recipientIds.map(r=>({recipient_id:r,kind:spec.kind,title:spec.title.slice(0,200),course:spec.course||null,section:spec.section||null,paths}));
    const{error}=await sb.from('shares').insert(rows);
    if(error)throw error;
    return rows.length;
  }catch(e){
    if(paths.length)await sb.storage.from(SHARE_BUCKET).remove(paths).catch(()=>{});
    throw e;
  }
}

// Revoke = delete the share row; the files go too once no other share of mine still lists them.
async function revokeShare(share){
  const{error}=await sb.from('shares').delete().eq('id',share.id);
  if(error)throw error;
  const{data:left}=await sb.from('shares').select('id').eq('owner_id',currentUser.id).overlaps('paths',share.paths).limit(1);
  if(!left?.length)await sb.storage.from(SHARE_BUCKET).remove(share.paths).catch(e=>console.warn('Share cleanup',e));
}

// Entry points used by the existing Share spots (their own share methods are untouched).
async function sharePdfWithPeople(meta,row){
  const ctx=(meta.sessionIds||[]).map(id=>findSessionContext(id)).find(Boolean);
  const course=ctx?.course.name||state.courses.find(c=>c.id===meta.courseId)?.name||'';
  shareWithPeople({kind:'pdf',title:meta.title,course,section:ctx?.section.name||'',files:async()=>[{blob:row.blob,name:meta.fileName||`${meta.title}.pdf`}]});
}
function shareSessionWithPeople(course,section,session){
  shareWithPeople({kind:'photos',title:session.title,course:course.name,section:section.name,files:async()=>{
    const out=[];
    for(let i=0;i<session.photoIds.length;i++){const r=await photoRow(session.photoIds[i]);if(!r?.blob)continue;const b=photoBlob(r);out.push({blob:b,name:`${i+1}.${/png/.test(b.type)?'png':/webp/.test(b.type)?'webp':'jpg'}`})}
    return out;
  }});
}

// ---------- receiving side ----------
async function loadReceivedShares(){
  const{data:shares,error}=await sb.from('shares').select('id,owner_id,kind,title,course,section,paths,created_at').eq('recipient_id',currentUser.id).order('created_at',{ascending:false});
  if(error)throw error;
  const ids=[...new Set((shares||[]).map(s=>s.owner_id))];
  let by=new Map();
  if(ids.length){const{data}=await sb.from('public_profiles').select('uid,holioo_id,display_name,avatar_url').in('uid',ids);by=new Map((data||[]).map(p=>[p.uid,p]))}
  const groups=new Map();
  for(const s of shares||[]){
    if(!groups.has(s.owner_id))groups.set(s.owner_id,{sender:by.get(s.owner_id)||{uid:s.owner_id,display_name:'Étudiant'},docs:[]});
    groups.get(s.owner_id).docs.push(s);
  }
  return[...groups.values()].sort((a,b)=>String(b.docs[0].created_at).localeCompare(String(a.docs[0].created_at)));
}
// Files are fetched through short-lived signed URLs (checked by RLS) and shown from memory — no link is kept in the page.
async function fetchSharedBlobs(share){
  const out=[];
  for(const path of share.paths){
    const{data,error}=await sb.storage.from(SHARE_BUCKET).createSignedUrl(path,60);
    if(error)throw error;
    const r=await fetch(data.signedUrl,{cache:'no-store'});if(!r.ok)throw new Error('fetch');
    out.push(await r.blob());
  }
  return out;
}
async function mySentShares(){
  const{data,error}=await sb.from('shares').select('id,recipient_id,kind,title,course,section,paths,created_at').eq('owner_id',currentUser.id).order('created_at',{ascending:false});
  if(error)throw error;
  return data||[];
}

// ---------- block a person ----------
async function loadBlocked(){
  const{data:rows,error}=await sb.from('blocks').select('blocked_id,created_at').order('created_at',{ascending:false});
  if(error)throw error;
  if(!rows?.length)return[];
  const{data}=await sb.from('public_profiles').select('uid,holioo_id,display_name,avatar_url').in('uid',rows.map(r=>r.blocked_id));
  const by=new Map((data||[]).map(p=>[p.uid,p]));
  return rows.map(r=>by.get(r.blocked_id)||{uid:r.blocked_id,display_name:'Étudiant'});
}
// Blocking: they vanish from my list, what I shared with them is withdrawn, what they shared with me is removed,
// and they can no longer find me, add me or share with me (they are not told).
async function blockPerson(p){
  const{error}=await sb.from('blocks').insert({blocked_id:p.uid});
  if(error&&error.code!=='23505')throw error;
  await removePerson(p).catch(e=>console.warn('Block cleanup',e));
  await sb.from('shares').delete().eq('recipient_id',currentUser.id).eq('owner_id',p.uid);
  peopleCache=null;
}
async function unblockPerson(uidToUnblock){
  const{error}=await sb.from('blocks').delete().eq('blocker_id',currentUser.id).eq('blocked_id',uidToUnblock);
  if(error)throw error;
}

// ---------- unread badge on Holioo Shares ----------
const sharesSeenKey=()=>`holioo-shares-seen:${currentUser?.id||''}`;
function sharesSeenAt(){try{return localStorage.getItem(sharesSeenKey())||'1970-01-01T00:00:00Z'}catch{return'1970-01-01T00:00:00Z'}}
function markSharesSeen(){try{localStorage.setItem(sharesSeenKey(),new Date().toISOString())}catch{}}
async function countUnreadShares(){
  if(!peopleReady())return 0;
  const{count,error}=await sb.from('shares').select('id',{count:'exact',head:true}).eq('recipient_id',currentUser.id).gt('created_at',sharesSeenAt());
  return error?0:(count||0);
}
async function refreshSharesBadge(){
  const btn=byId('holiooSharesBtn');if(!btn)return;
  let n=0;try{n=await countUnreadShares()}catch{}
  if(!btn.isConnected)return;
  btn.querySelector('.hs-badge')?.remove();
  if(n>0){btn.insertAdjacentHTML('beforeend',`<i class="hs-badge" aria-hidden="true">${n>9?'9+':n}</i>`);btn.setAttribute('aria-label',`Holioo Shares, ${n} nouveau${n>1?'x':''}`)}
  else btn.setAttribute('aria-label','Holioo Shares');
}

// ---------- my QR code → opens the Add sheet on the other phone ----------
const holiooAddLink=id=>`${location.origin}${location.pathname}#add=${encodeURIComponent(id)}`;
function qrSvg(text){
  const q=window.HolioQR.matrix(text),n=q.size,m=2; // 2-module quiet zone is enough on a white tile
  let d='';for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(q.data[y*n+x])d+=`M${x+m} ${y+m}h1v1h-1z`;
  return`<svg class="ppl-qr" viewBox="0 0 ${n+2*m} ${n+2*m}" role="img" aria-label="QR code de votre identifiant Holioo" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
}
function openMyQrSheet(){
  const id=state.profile.holiooId;
  if(!id){showToast('Identifiant indisponible');return}
  openSheet({title:'Mon code Holioo',subtitle:'Faites-le scanner avec l’appareil photo : l’ajout s’ouvre directement.',
    body:`<div class="ppl-qr-wrap">${qrSvg(holiooAddLink(id))}<p class="ppl-qr-id">@${esc(id)}</p><button class="action-btn ghost" type="button" id="pplQrCopy">${icon('copy',{size:18})}<span>Copier l’identifiant</span></button></div>`,confirmText:'Fermer',secondaryText:'',onConfirm:()=>true});
  byId('pplQrCopy')?.addEventListener('click',()=>copyHoliooId(id));
}

// ---------- scan someone's QR code → find them → add as a friend (two-way, instant) ----------
const QR_SCAN_JSQR='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
let qrLibPromise=null;
function loadJsQR(){
  if(window.jsQR)return Promise.resolve(window.jsQR);
  return qrLibPromise||(qrLibPromise=new Promise((ok,no)=>{const t=document.createElement('script');t.src=QR_SCAN_JSQR;t.onload=()=>ok(window.jsQR);t.onerror=()=>{qrLibPromise=null;no(new Error('jsqr'))};document.head.append(t)}));
}
// A scanned text is my QR link (#add=<id>) or a bare Holioo ID; anything else is ignored.
function holiooIdFromScan(text){
  const t=String(text||'').trim();
  try{const id=new URLSearchParams(new URL(t).hash.slice(1)).get('add');if(id&&/^[a-z0-9]{4,40}$/i.test(id))return id.toLowerCase()}catch{}
  const m=t.replace(/^@/,'');return/^[a-z0-9]{4,40}$/i.test(m)?m.toLowerCase():null;
}
function openQrScanSheet(after=()=>{}){
  if(guestMode||!currentUser){showToast('Connectez-vous avec Google pour ajouter des amis');return}
  if(!needOnline())return;
  if(!navigator.mediaDevices?.getUserMedia){showToast('Caméra indisponible ici');return}
  let stream=null,stopped=false,busy=false;
  const stop=()=>{stopped=true;stream?.getTracks().forEach(t=>t.stop());stream=null};
  openSheet({title:'Scanner un code QR',subtitle:'Visez le code QR Holioo d’un ami : il est ajouté tout de suite.',
    body:`<div class="ppl-scan"><video id="pplScanVideo" playsinline muted autoplay></video></div><p class="ppl-note" id="pplScanMsg" aria-live="polite">Démarrage de la caméra…</p>`,
    confirmText:'Fermer',secondaryText:'',onConfirm:()=>{stop();return true}});
  // Closing the sheet any other way (backdrop tap) also ends the camera.
  const watch=setInterval(()=>{if(!byId('pplScanVideo')){clearInterval(watch);stop()}},400);
  const msg=t=>{const m=byId('pplScanMsg');if(m)m.textContent=t};
  (async()=>{
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      const v=byId('pplScanVideo');if(stopped||!v){stop();return}
      v.srcObject=stream;await v.play().catch(()=>{});msg('Cherchez le code QR…');
      const det=window.BarcodeDetector?new BarcodeDetector({formats:['qr_code']}):null;
      const jsqr=det?null:await loadJsQR();
      const cv=document.createElement('canvas'),cx=cv.getContext('2d',{willReadFrequently:true});
      while(!stopped&&byId('pplScanVideo')){
        await new Promise(r=>setTimeout(r,200));
        if(busy||!v.videoWidth)continue;
        let text=null;
        if(det){try{text=(await det.detect(v))[0]?.rawValue||null}catch{}}
        else{const k=Math.min(1,640/v.videoWidth);cv.width=Math.round(v.videoWidth*k);cv.height=Math.round(v.videoHeight*k);cx.drawImage(v,0,0,cv.width,cv.height);text=jsqr(cx.getImageData(0,0,cv.width,cv.height).data,cv.width,cv.height)?.data||null}
        if(!text)continue;
        const id=holiooIdFromScan(text);
        if(!id){msg('Ce code n’est pas un code Holioo.');continue}
        busy=true;msg('Code lu, recherche…');
        try{
          const p=await findPerson(id);
          if(!p){msg('Personne introuvable.');busy=false;await new Promise(r=>setTimeout(r,1500));continue}
          if(p.uid===currentUser.id){msg('C’est votre propre code.');busy=false;await new Promise(r=>setTimeout(r,1500));continue}
          await addPerson(p.uid);
          stop();sheetRoot.innerHTML='';showToast(`${personName(p)} ajouté(e) comme ami`);after();return;
        }catch(e){console.error(e);msg(peopleErrorText(e));busy=false;await new Promise(r=>setTimeout(r,2000))}
      }
    }catch(e){console.error(e);stop();msg(e?.name==='NotAllowedError'?'Autorisez la caméra pour scanner.':'Impossible de lancer la caméra.')}
  })();
}
// A scanned link (#add=<id>) is kept until the user is signed in (the Google round trip drops the address), then opens the Add sheet.
const PENDING_ADD_KEY='holioo-pending-add';
function captureAddLink(){
  try{
    const id=new URLSearchParams(location.hash.slice(1)).get('add');
    if(!id||!/^[a-z0-9]{4,40}$/i.test(id))return;
    sessionStorage.setItem(PENDING_ADD_KEY,id);
    const rest=new URLSearchParams(location.hash.slice(1));rest.delete('add');
    history.replaceState(null,'',location.pathname+location.search+(rest.toString()?`#${rest}`:''));
  }catch{}
}
function consumePendingAdd(){
  let id=null;try{id=sessionStorage.getItem(PENDING_ADD_KEY)}catch{}
  if(!id||!currentUser||guestMode||sheetRoot.innerHTML)return;
  try{sessionStorage.removeItem(PENDING_ADD_KEY)}catch{}
  openPeopleSearchSheet(()=>{if(currentView==='people')render()},{prefill:id,autoSearch:true});
}
captureAddLink();
