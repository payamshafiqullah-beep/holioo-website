// Holioo Shares — everything other people shared with me, grouped by sender (avatar + name on one line, then documents).
// Above each document: one line of its own metadata, e.g. "PDF · TD · Chimie". Reached from the icon in Bibliothèque.
async function renderHolioShares(){
  setChrome(false);
  app.innerHTML=`<section class="screen hs-screen">${PageHeader({back:true,title:'Holioo Shares',actions:false})}
    <div id="hsBody"><p class="ppl-note">Chargement…</p></div></section>`;
  byId('backBtn').onclick=()=>navigate('library');
  const body=byId('hsBody');
  if(guestMode||!currentUser){body.innerHTML=Notice(`${icon('user',{size:18})}<span>Connectez-vous avec Google pour recevoir des partages.</span>`,'peach');return}
  if(!peopleReady()){body.innerHTML=Notice(`${icon('wifiOff',{size:18})}<span>Connexion Internet nécessaire pour afficher les partages reçus.</span>`,'peach');return}
  let groups;
  try{groups=await loadReceivedShares()}catch(e){console.error(e);if(currentView==='holiooShares')body.innerHTML=Notice('Impossible de charger les partages pour le moment.','peach');return}
  if(currentView!=='holiooShares')return;
  if(!groups.length){body.innerHTML=EmptyState({iconName:'users',title:'Rien pour le moment',text:'Les documents que d’autres personnes Holioo partagent avec vous apparaîtront ici.'});return}
  const docs=new Map();
  body.innerHTML=groups.map(g=>`<section class="hs-group"><div class="hs-sender">${peopleAvatar(g.sender,'sm')}<strong>${esc(personName(g.sender))}</strong></div>
    ${g.docs.map(d=>{docs.set(d.id,d);return`<div class="hs-doc"><p class="hs-meta">${esc(shareMetaLine(d))}</p><div class="hs-doc-row"><button class="list-card hs-open" type="button" data-share-open="${esc(d.id)}">${IconBadge(d.kind==='pdf'?'fileText':'image',d.kind==='pdf'?'pink':'lavender','md')}<span class="list-card-copy"><strong>${esc(d.title)}</strong></span><span class="chev">${icon('chevronRight',{size:20})}</span></button><button class="icon-btn flat hs-remove" type="button" data-share-remove="${esc(d.id)}" aria-label="Retirer de ma liste" title="Retirer de ma liste">${icon('x',{size:20})}</button></div></div>`}).join('')}</section>`).join('');
  body.querySelectorAll('[data-share-open]').forEach(b=>b.onclick=()=>{currentSharedDoc=docs.get(b.dataset.shareOpen);if(currentSharedDoc)navigate('sharedViewer')});
  body.querySelectorAll('[data-share-remove]').forEach(b=>b.onclick=()=>{
    const d=docs.get(b.dataset.shareRemove);if(!d)return;
    openSheet({title:'Retirer de votre liste ?',subtitle:`« ${d.title} » disparaîtra de vos Holioo Shares. L’expéditeur peut le partager de nouveau.`,confirmText:'Retirer',confirmClass:'coral',onConfirm:async()=>{
      const{error}=await sb.from('shares').delete().eq('id',d.id);
      if(error){showToast('Retrait impossible');return false}
      showToast('Retiré');render();return true}});
  });
}
