// Captures (Inbox) — lots de photos non classés.
async function renderInbox(){
  setChrome(false);
  const total=state.inbox.reduce((a,b)=>a+b.photoIds.length,0);
  app.innerHTML=`<section class="screen">
    ${PageHeader({back:true,title:'Captures'})}
    ${PageIntro({eyebrow:'INBOX',title:'Captures à trier',subtitle:total?`${plural(total,'photo')} en attente. Touchez un lot pour l’organiser.`:'Vos captures non classées apparaîtront ici.'})}
    <div class="card-stack" id="inboxList"></div>
  </section>`;
  byId('backBtn').onclick=()=>goBack('home');
  if(!state.inbox.length){byId('inboxList').innerHTML=EmptyState({iconName:'checkCircle',title:'Tout est classé',text:'Aucune capture en attente.',action:ActionButton({label:'Capturer',variant:'capture',iconName:'camera',full:false,attrs:'data-nav="capture"'})});return}
  for(const batch of state.inbox){
    const el=document.createElement('button');el.className='inbox-card';el.dataset.batch=batch.id;
    const preview=[];
    for(const id of batch.photoIds.slice(0,4)){const url=await photoThumbUrl(id);if(url)preview.push(url)}
    el.innerHTML=`<span class="inbox-card-head">${IconBadge('layers','peach','md')}<span class="list-card-copy"><strong>${esc(batch.title||`Capture ${fmtShort(batch.createdAt)}`)}</strong><small>${plural(batch.photoIds.length,'photo')} · ${fmtDate(batch.createdAt)}</small></span><span class="chev">${icon('chevronRight',{size:20})}</span></span><span class="inbox-preview">${preview.map((src,i)=>`<img src="${src}" alt="Aperçu ${i+1}" decoding="async">`).join('')}${batch.photoIds.length>4?`<span>+${batch.photoIds.length-4}</span>`:''}</span>`;
    // The batch stays in Captures until its photos are filed (see removeFromInbox).
    el.onclick=()=>{currentBatch={...batch,photoIds:[...batch.photoIds],selected:new Set(batch.photoIds),splitQueue:[]};navigate('captureComplete')};
    byId('inboxList').appendChild(el);
  }
  enableMultiSelect({root:byId('inboxList'),itemSelector:'.inbox-card',idOf:el=>el.dataset.batch,noun:['lot','lots'],remove:bulkRemoveBatches});
}
