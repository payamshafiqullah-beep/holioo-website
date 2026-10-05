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