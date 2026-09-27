async function renderInbox(){
  app.innerHTML=`${pageHead('Inbox','Captures locales non classées. Touchez un lot pour voir toutes les photos comme dans une galerie.','INBOX')}<div class="grid" id="inboxList"></div>`;
  if(!state.inbox.length){byId('inboxList').innerHTML='<div class="card empty"><div class="empty-icon">✓</div>Inbox est vide.</div>';return}
  for(const batch of state.inbox){
    const el=document.createElement('button');el.className='card inbox-card card-button';
    const preview=[];
    for(const id of batch.photoIds.slice(0,4)){const row=await DB.get('photos',id);if(row?.blob)preview.push(URL.createObjectURL(row.blob))}
    el.innerHTML=`<div class="inbox-card-head"><span class="section-icon custom">${batch.photoIds.length}</span><span class="grow"><span class="title">${esc(batch.title||`Capture ${fmtShort(batch.createdAt)}`)}</span><span class="meta">${batch.photoIds.length} photo${batch.photoIds.length>1?'s':''} • ${fmtDate(batch.createdAt)}</span></span><span class="chev">›</span></div><div class="inbox-preview">${preview.map((src,i)=>`<img src="${src}" alt="Aperçu ${i+1}">`).join('')}${batch.photoIds.length>4?`<span>+${batch.photoIds.length-4}</span>`:''}</div>`;
    el.onclick=()=>{state.inbox=state.inbox.filter(x=>x.id!==batch.id);saveState();currentBatch={...batch,selected:new Set(batch.photoIds),splitQueue:[]};navigate('captureComplete')};
    byId('inboxList').appendChild(el);
  }
}