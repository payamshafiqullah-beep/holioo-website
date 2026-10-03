// People — the people I added (private list), with remove, and what I shared with them (revoke).
// Reached from Profil, under "Mode sombre". Phone, tablet and computer use the same screen.
async function renderPeople(){
  setChrome(false);
  const shell=`<section class="screen people-screen">${PageHeader({back:true,title:'Personnes',actions:false})}
    ${PageIntro({eyebrow:'HOLIOO',title:'Personnes',subtitle:'Les personnes que vous avez ajoutées avec leur identifiant. Elles ne voient ni votre e-mail ni vos données.'})}
    <div class="button-stack">${ActionButton({label:'Ajouter une personne',id:'pplAddBtn',iconName:'plus'})}</div>
    <div id="pplBody">${guestMode?'':'<p class="ppl-note">Chargement…</p>'}</div></section>`;
  app.innerHTML=shell;
  byId('backBtn').onclick=()=>navigate('profile');
  if(guestMode||!currentUser){byId('pplBody').innerHTML=Notice(`${icon('user',{size:18})}<span>Connectez-vous avec Google pour ajouter des personnes.</span>`,'peach');byId('pplAddBtn').disabled=true;return}
  if(!peopleReady()){byId('pplBody').innerHTML=Notice(`${icon('wifiOff',{size:18})}<span>Connexion Internet nécessaire pour afficher vos personnes.</span>`,'peach');byId('pplAddBtn').disabled=true;return}
  byId('pplAddBtn').onclick=()=>openPeopleSearchSheet(()=>{if(currentView==='people')render()});
  let people,sent;
  try{[people,sent]=await Promise.all([loadPeople(),mySentShares()])}catch(e){console.error(e);if(currentView==='people')byId('pplBody').innerHTML=Notice('Impossible de charger vos personnes pour le moment.','peach');return}
  if(currentView!=='people')return;
  const by=new Map(people.map(p=>[p.uid,p]));
  const list=people.length?`<div class="ppl-list">${people.map(p=>`<div class="ppl-row" data-person="${esc(p.uid)}">${peopleAvatar(p)}<span class="ppl-copy"><strong>${esc(personName(p))}</strong></span><button class="icon-btn flat ppl-remove" type="button" data-remove="${esc(p.uid)}" aria-label="Retirer ${esc(personName(p))}" title="Retirer">${icon('trash',{size:20})}</button></div>`).join('')}</div>`
    :EmptyState({iconName:'users',title:'Aucune personne',text:'Ajoutez quelqu’un avec son identifiant Holioo pour lui partager des documents.'});
  const given=sent.filter(s=>by.has(s.recipient_id));
  const sentHtml=given.length?`${SectionTitle('Partagés par moi',{count:given.length})}<div class="ppl-list">${given.map(s=>`<div class="ppl-row ppl-sent">${peopleAvatar(by.get(s.recipient_id),'sm')}<span class="ppl-copy"><small class="ppl-meta">${esc(shareMetaLine(s))}</small><strong>${esc(s.title)}</strong><small>avec ${esc(personName(by.get(s.recipient_id)))}</small></span><button class="action-btn ghost ppl-revoke" type="button" data-revoke="${esc(s.id)}">Retirer l’accès</button></div>`).join('')}</div>`:'';
  byId('pplBody').innerHTML=`${list}${sentHtml}`;
  document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{
    const p=by.get(b.dataset.remove);if(!p)return;
    const n=sent.filter(s=>s.recipient_id===p.uid).length;
    openSheet({title:`Retirer ${personName(p)} ?`,subtitle:n?`Les ${n} partage(s) en cours avec cette personne seront aussi retirés.`:'Cette personne ne pourra plus recevoir de documents de votre part tant que vous ne l’ajoutez pas de nouveau.',confirmText:'Retirer',confirmClass:'coral',onConfirm:async()=>{
      try{await removePerson(p);showToast('Personne retirée');render();return true}catch(e){console.error(e);showToast('Suppression impossible');return false}}});
  });
  document.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=async()=>{
    const s=sent.find(x=>x.id===b.dataset.revoke);if(!s)return;
    b.disabled=true;
    try{await revokeShare(s);showToast('Accès retiré');render()}catch(e){console.error(e);b.disabled=false;showToast('Retrait impossible')}
  });
}
