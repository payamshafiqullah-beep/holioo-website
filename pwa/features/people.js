// People + Holioo Shares: add someone by their exact Holioo ID, share a document with them (view-only), revoke.
// Privacy model (supabase/migrations/20261004120000_people_and_shares.sql):
//  - a person is only ever seen as {uid, holioo_id, display_name, avatar_url} (table public_profiles — no e-mail);
//  - the lookup is ONE exact-match RPC, never a list or a prefix search;
//  - connections (my list of people) are private to me; adding is instant and one-way;
//  - a share = a row per (document, recipient) + files in the PRIVATE bucket `shared-items`, readable only by the owner
//    and by a recipient of a share that lists that file; the recipient cannot share onward; the owner revokes.

const SHARE_BUCKET='shared-items';
const SHARE_MAX_BYTES=25*1024*1024;
let peopleCache=null; // [{uid,holioo_id,display_name,avatar_url,since}] — filled by loadPeople()

const personName=p=>p?.display_name||'Étudiant';
function peopleAvatar(p,cls=''){
  return`<span class="ppl-avatar ${cls}">${p?.avatar_url?`<img src="${esc(p.avatar_url)}" alt="" loading="lazy" draggable="false" referrerpolicy="no-referrer">`:esc(iconLetter(personName(p)))}</span>`;
}
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
  const{error}=await sb.from('connections').insert({person_id:uidToAdd});
  if(error&&error.code!=='23505')throw error; // already added = fine
  peopleCache=null;
}
async function removePerson(person){
  // Removing someone also withdraws what was shared with them.
  const{data:rows}=await sb.from('shares').select('id,paths').eq('owner_id',currentUser.id).eq('recipient_id',person.uid);
  for(const r of rows||[])await revokeShare(r);
  const{error}=await sb.from('connections').delete().eq('owner_id',currentUser.id).eq('person_id',person.uid);
  if(error)throw error;
  peopleCache=null;
}

// Exact-ID search sheet: shows ONLY name + photo + Add. `after` runs when the list changed.
function openPeopleSearchSheet(after=()=>{}){
  const close=openSheet({title:'Ajouter une personne',subtitle:'Saisissez son identifiant Holioo exact.',
    body:`<div class="field"><label for="holiooLookup">Identifiant Holioo</label><input id="holiooLookup" type="text" inputmode="text" autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Ex. h1234567890" maxlength="41"></div><div id="pplFound" class="ppl-found" aria-live="polite"></div>`,
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
      }catch(err){console.error(err);box.innerHTML='<p class="ppl-note">Recherche impossible pour le moment.</p>'}
      return false; // the sheet stays open to show the result
    }});
  setTimeout(()=>byId('holiooLookup')?.focus(),50);
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
    openSheet({title:'Aucune personne ajoutée',subtitle:'Ajoutez d’abord quelqu’un avec son identifiant Holioo.',body:'',confirmText:'Ajouter une personne',onConfirm:()=>{openPeopleSearchSheet(()=>shareWithPeople(spec));return false}});
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
