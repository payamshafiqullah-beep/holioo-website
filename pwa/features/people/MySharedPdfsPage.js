// Mes PDF partagés — only the PDFs I shared: published to the library (bibliothèque) or sent to Holioo people.
// Reached from "PDF partagés" on Accueil. What others shared with me lives in Holioo Shares.
async function renderMySharedPdfs(){
  setChrome(false);
  app.innerHTML=`<section class="screen">${PageHeader({back:true,title:'PDF partagés',actions:false})}<div id="spBody">${peopleSkeleton(2)}</div></section>`;
  byId('backBtn').onclick=()=>goBack('home');
  const body=byId('spBody');
  if(guestMode||!currentUser){body.innerHTML=Notice(`${icon('user',{size:18})}<span>Connectez-vous avec Google pour partager des PDF.</span>`,'peach');return}
  if(!peopleReady()){body.innerHTML=Notice(`${icon('wifiOff',{size:18})}<span>Connexion Internet nécessaire pour afficher vos PDF partagés.</span>`,'peach');return}
  let lib,sent,people;
  try{
    [lib,sent,people]=await Promise.all([
      sb.from('public_materials').select('id,title,course,academic_year,created_at').eq('owner_id',currentUser.id).eq('type','PDF').order('created_at',{ascending:false}).then(r=>{if(r.error)throw r.error;return r.data||[]}),
      mySentShares(),loadPeople()]);
  }catch(e){console.error(e);if(currentView==='mySharedPdfs'){body.innerHTML=peopleErrorHtml(e);byId('pplRetry').onclick=()=>render()}return}
  if(currentView!=='mySharedPdfs')return;
  const by=new Map(people.map(p=>[p.uid,p]));
  const given=sent.filter(s=>s.kind==='pdf'&&by.has(s.recipient_id));
  if(!lib.length&&!given.length){body.innerHTML=EmptyState({iconName:'fileText',title:'Aucun PDF partagé',text:'Les PDF que vous publiez dans la bibliothèque ou envoyez à des personnes Holioo apparaîtront ici. Ouvrez un PDF dans Fichiers puis touchez Partager.'});return}
  const libHtml=lib.length?`${SectionTitle('Dans la bibliothèque',{count:lib.length})}<div class="ppl-list">${lib.map(m=>`<div class="ppl-row ppl-sent">${IconBadge('fileText','pink','md')}<span class="ppl-copy"><small class="ppl-meta">${esc(['PDF',m.course,m.academic_year].filter(Boolean).join(' · '))}</small><strong>${esc(m.title)}</strong></span></div>`).join('')}</div>`:'';
  const sentHtml=given.length?`${SectionTitle('Envoyés à des personnes',{count:given.length})}<div class="ppl-list">${given.map(s=>`<div class="ppl-row ppl-sent">${peopleAvatar(by.get(s.recipient_id),'sm')}<span class="ppl-copy"><small class="ppl-meta">${esc(shareMetaLine(s))}</small><strong>${esc(s.title)}</strong><small>avec ${esc(personName(by.get(s.recipient_id)))}</small></span><button class="action-btn ghost ppl-revoke" type="button" data-revoke="${esc(s.id)}">Retirer l’accès</button></div>`).join('')}</div>`:'';
  body.innerHTML=libHtml+sentHtml;
  body.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=()=>{
    const s=given.find(x=>x.id===b.dataset.revoke);if(!s)return;
    openSheet({title:'Retirer l’accès ?',subtitle:`« ${s.title} » disparaîtra des Holioo Shares de ${personName(by.get(s.recipient_id))}.`,confirmText:'Retirer',confirmClass:'coral',onConfirm:async()=>{
      try{await revokeShare(s);showToast('Accès retiré');render();return true}catch(e){console.error(e);showToast('Retrait impossible');return false}}});
  });
}
