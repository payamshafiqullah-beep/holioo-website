// People, sharing: sharing PDFs and séances with people, received shares, blocking.
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