// Holioo Shares — everything other people shared with me, grouped by sender (avatar + name on one line, then documents).
// Above each document: one line of its own metadata, e.g. "PDF · TD · Chimie". Reached from the icon in Bibliothèque.
async function renderHolioShares(){
  setChrome(false);
  app.innerHTML=`<section class="screen hs-screen">${PageHeader({back:true,title:'Holioo Shares',actions:false})}
    <div id="hsBody">${peopleSkeleton(2)}</div></section>`;
  byId('backBtn').onclick=()=>goBack('home');
  const body=byId('hsBody');
  if(guestMode||!currentUser){body.innerHTML=Notice(`${icon('user',{size:18})}<span>Connectez-vous avec Google pour recevoir des partages.</span>`,'peach');return}
  if(!peopleReady()){body.innerHTML=Notice(`${icon('wifiOff',{size:18})}<span>Connexion Internet nécessaire pour afficher les partages reçus.</span>`,'peach');return}
  let groups;const seenBefore=sharesSeenAt();
  try{groups=await loadReceivedShares()}catch(e){console.error(e);if(currentView==='holiooShares'){body.innerHTML=peopleErrorHtml(e);byId('pplRetry').onclick=()=>render()}return}
  if(currentView!=='holiooShares')return;
  markSharesSeen();
  if(!groups.length){body.innerHTML=EmptyState({iconName:'users',title:'Rien pour le moment',text:'Les documents que d’autres personnes Holioo partagent avec vous apparaîtront ici. Pour recevoir, donnez votre identifiant ou votre code QR (Profil › Personnes).'});return}
  const docs=new Map();
  body.innerHTML=groups.map(g=>`<section class="hs-group"><div class="hs-sender">${peopleAvatar(g.sender,'sm')}<strong>${esc(personName(g.sender))}</strong>${g.docs.some(d=>d.created_at>seenBefore)?'<span class="hs-new">Nouveau</span>':''}<button class="icon-btn flat hs-block" type="button" data-block-sender="${esc(g.sender.uid)}" aria-label="Bloquer ${esc(personName(g.sender))}" title="Bloquer">${icon('ban',{size:18})}</button></div>
    ${g.docs.map(d=>{docs.set(d.id,d);return`<div class="hs-doc"><p class="hs-meta">${esc(shareMetaLine(d))}</p><div class="hs-doc-row"><button class="list-card hs-open" type="button" data-share-open="${esc(d.id)}">${IconBadge(d.kind==='pdf'?'fileText':'image',d.kind==='pdf'?'pink':'lavender','md')}<span class="list-card-copy"><strong>${esc(d.title)}</strong></span><span class="chev">${icon('chevronRight',{size:20})}</span></button><button class="icon-btn flat hs-remove" type="button" data-share-remove="${esc(d.id)}" aria-label="Retirer de ma liste" title="Retirer de ma liste">${icon('x',{size:20})}</button></div></div>`}).join('')}</section>`).join('');
  body.querySelectorAll('[data-block-sender]').forEach(b=>b.onclick=()=>{
    const g=groups.find(x=>x.sender.uid===b.dataset.blockSender);if(!g)return;
    openSheet({title:`Bloquer ${personName(g.sender)} ?`,subtitle:'Ses partages disparaissent de votre liste. Cette personne ne pourra plus vous trouver, vous ajouter ni partager avec vous, et n’est pas prévenue.',confirmText:'Bloquer',confirmClass:'coral',onConfirm:async()=>{
      try{await blockPerson(g.sender);showToast('Personne bloquée');render();return true}catch(e){console.error(e);showToast(peopleErrorText(e));return false}}});
  });
  body.querySelectorAll('[data-share-open]').forEach(b=>b.onclick=()=>{currentSharedDoc=docs.get(b.dataset.shareOpen);if(currentSharedDoc)navigate('sharedViewer')});
  body.querySelectorAll('[data-share-remove]').forEach(b=>b.onclick=()=>{
    const d=docs.get(b.dataset.shareRemove);if(!d)return;
    openSheet({title:'Retirer de votre liste ?',subtitle:`« ${d.title} » disparaîtra de vos Holioo Shares. L’expéditeur peut le partager de nouveau.`,confirmText:'Retirer',confirmClass:'coral',onConfirm:async()=>{
      const{error}=await sb.from('shares').delete().eq('id',d.id);
      if(error){showToast('Retrait impossible');return false}
      showToast('Retiré');render();return true}});
  });
}
