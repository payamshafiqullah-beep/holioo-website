// Profil — identité Holioo et contexte académique (facultatif).
function renderProfile(){
  setChrome(false);
  const p=state.profile;
  app.innerHTML=`<section class="screen">
    ${PageHeader({back:true,title:'Profil',actions:false})}
    <div class="profile-card">
      <span class="profile-avatar">${esc(iconLetter(p.displayName))}</span>
      <strong>${esc(p.displayName)}</strong>
      <small>@${esc(p.holiooId||'connexion…')}</small>
      ${Tag(p.publicProfile?'Profil public':'Profil privé',p.publicProfile?'sky':'mint')}
    </div>
    ${SectionTitle('Informations académiques')}
    <div class="form-card">
      ${Field({label:'Nom affiché',id:'pName',value:p.displayName})}
      ${Field({label:'Université',id:'pUni',value:p.university})}
      ${Field({label:'Faculté',id:'pFaculty',value:p.faculty})}
      ${Field({label:'Filière / majeure',id:'pProgram',value:p.program})}
      <div class="field-row">${Field({label:'Niveau',id:'pLevel',value:p.level})}${Field({label:'Semestre',id:'pSemester',value:p.semester})}</div>
      ${Field({label:'Année universitaire',id:'pYear',value:p.academicYear})}
    </div>
    <label class="toggle-card"><span class="list-card-copy"><strong>Profil public facultatif</strong><small>Trouvable uniquement avec l’identifiant Holioo exact. Aucun chat ni abonnement.</small></span><input type="checkbox" id="pPublic" class="switch" ${p.publicProfile?'checked':''}></label>
    <div class="button-stack">
      ${ActionButton({label:'Enregistrer',id:'saveProfile',iconName:'check'})}
      ${ActionButton({label:'Google Drive & synchronisation',variant:'soft',iconName:'cloud',attrs:'data-nav="sync"'})}
      ${ActionButton({label:'Rechercher un Holioo ID',id:'searchId',variant:'ghost',iconName:'search'})}
    </div>
    <div id="idSearchResult"></div>
  </section>`;
  byId('backBtn').onclick=()=>navigate('home');
  byId('saveProfile').onclick=async()=>{Object.assign(state.profile,{displayName:byId('pName').value.trim()||'Étudiant',university:byId('pUni').value.trim(),faculty:byId('pFaculty').value.trim(),program:byId('pProgram').value.trim(),level:byId('pLevel').value.trim(),semester:byId('pSemester').value.trim(),academicYear:byId('pYear').value.trim()||'2026–2027',publicProfile:byId('pPublic').checked});saveState();try{await syncProfile();showToast('Profil enregistré')}catch{showToast('Profil enregistré localement')}render()};
  byId('searchId').onclick=()=>openSheet({title:'Rechercher un Holioo ID',subtitle:'Recherche exacte uniquement.',body:Field({label:'Identifiant',id:'holiooLookup',placeholder:'Ex. h1234567890'}),confirmText:'Rechercher',onConfirm:async close=>{const id=byId('holiooLookup').value.trim().replace(/^@/,'');if(!id||!sb){showToast('Connexion Internet nécessaire');return false}const{data}=await sb.from('profiles').select('holioo_id,name,display_name,university,program,level,semester,public_profile,is_public').eq('holioo_id',id).maybeSingle();close();byId('idSearchResult').innerHTML=data&&(data.public_profile||data.is_public)?`<div class="list-card static">${IconBadge('user','sky','md')}<span class="list-card-copy"><strong>${esc(data.name||data.display_name||'Étudiant')}</strong><small>@${esc(data.holioo_id)} · ${esc([data.university,data.program,data.level,data.semester].filter(Boolean).join(' · '))}</small><small>Consultation uniquement — aucun bouton de contact.</small></span></div>`:Notice('Profil introuvable ou privé.','peach');return false}});
}
