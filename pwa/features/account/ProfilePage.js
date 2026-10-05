// Profil — identité Holioo et contexte académique (facultatif).
function renderProfile(){
  setChrome(false);
  const p=state.profile;
  app.innerHTML=`<section class="screen">
    ${PageHeader({back:true,title:'Profil',actions:false})}
    <div class="profile-card">
      <label class="profile-avatar-picker" aria-label="Choisir une photo de profil" title="JPG, PNG ou WebP · 5 Mo max.">
        <span class="profile-avatar">${p.avatarUrl?`<img src="${esc(p.avatarUrl)}" alt="Photo de profil">`:esc(iconLetter(p.displayName))}</span>
        <span class="profile-avatar-camera">${icon('camera',{size:14,stroke:2.2})}</span>
        <input id="avatarInput" type="file" accept="image/jpeg,image/png,image/webp" hidden>
      </label>
      <span class="profile-card-copy">
        <strong>${esc(p.displayName)}</strong>
        <small class="profile-id-line">${esc(p.email||currentUser?.email||'')}${p.holiooId?` · <span class="profile-id-text">@${esc(p.holiooId)}</span><button class="copy-id-btn" id="copyHoliooId" type="button" aria-label="Copier l’identifiant Holioo" title="Copier l’identifiant">${icon('copy',{size:15})}</button>`:''}</small>
        ${Tag(p.publicProfile?'Profil public':'Profil privé',p.publicProfile?'sky':'mint')}
      </span>
    </div>
    ${guestMode?`<div class="notice tone-peach">${icon('user',{size:18})}<span>Mode test sans compte : vos cours restent sur cet appareil. Connectez-vous avec Google pour les sauvegarder dans Drive.</span></div>${ActionButton({label:'Se connecter avec Google',id:'guestToGoogle',variant:'primary'})}`:''}
    <details class="collapse-card">
      <summary>${IconBadge('cap','lavender','md')}<span class="list-card-copy"><strong>Informations académiques</strong><small>${esc([p.university,p.program,p.level,p.semester].filter(Boolean).join(' · ')||'Nom, université, filière, niveau…')}</small></span><span class="chev">${icon('chevronRight',{size:20})}</span></summary>
      <div class="collapse-body">
        ${Field({label:'Nom affiché',id:'pName',value:p.displayName})}
        ${Field({label:'Université',id:'pUni',value:p.university})}
        ${Field({label:'Faculté',id:'pFaculty',value:p.faculty})}
        ${Field({label:'Filière / majeure',id:'pProgram',value:p.program})}
        <div class="field-row">${Field({label:'Niveau',id:'pLevel',value:p.level})}${Field({label:'Semestre',id:'pSemester',value:p.semester})}</div>
        ${Field({label:'Année universitaire',id:'pYear',value:p.academicYear})}
        <label class="toggle-row"><span class="list-card-copy"><strong>Profil public facultatif</strong><small>Affiche votre nom et votre identifiant sur le matériel que vous publiez dans la bibliothèque. Aucun chat ni abonnement.</small></span><input type="checkbox" id="pPublic" class="switch" ${p.publicProfile?'checked':''}></label>
        ${ActionButton({label:'Enregistrer',id:'saveProfile',iconName:'check'})}
      </div>
    </details>
    <div class="list-stack">
      <label class="list-card static toggle-row">${IconBadge('sparkles','lavender','md')}<span class="list-card-copy"><strong>Mode sombre</strong><small>Thème sombre pour toute l’application.</small></span><input type="checkbox" id="pDark" class="switch" ${document.documentElement.dataset.theme==='dark'?'checked':''}></label>
      ${ListCard({iconName:'users',tone:'sky',title:'Personnes',meta:'Les personnes ajoutées et vos partages',attrs:'data-nav="people"'})}
      ${notebookCanEdit()?`<label class="list-card static toggle-row">${IconBadge('pencil','mint','md')}<span class="list-card-copy"><strong>Dessiner avec le doigt</strong><small>Désactivé par défaut pour éviter les marques avec la main.</small></span><input type="checkbox" id="pDrawFinger" class="switch" ${state.settings.drawWithFinger?'checked':''}></label>`:''}
      ${ListCard({iconName:'cloud',tone:'sky',title:'Google Drive & synchronisation',attrs:'data-nav="sync"'})}
      ${ListCard({iconName:'search',tone:'mint',title:'Rechercher un Holioo ID',attrs:'id="searchId"'})}
      ${currentRole==='admin'?ListCard({iconName:'users',tone:'lavender',title:'Administration des utilisateurs',attrs:'data-nav="admin"'}):''}
      ${ListCard({iconName:'arrowLeft',tone:'pink',title:guestMode?'Quitter le mode test':'Se déconnecter',attrs:'id="logoutBtn"',trailing:false})}
    </div>
    <p class="legal-links"><a href="/confidentialite.html" target="_blank" rel="noopener">Politique de confidentialité</a> · <a href="/conditions.html" target="_blank" rel="noopener">Conditions d’utilisation</a></p>
  </section>`;
  byId('backBtn').onclick=()=>navigate('home');
  byId('pDrawFinger')?.addEventListener('change',e=>{state.settings.drawWithFinger=e.target.checked;saveState();showToast(e.target.checked?'Dessin au doigt activé':'Dessin au doigt désactivé')});
  byId('pDark')?.addEventListener('change',e=>{const on=e.target.checked;if(on)document.documentElement.setAttribute('data-theme','dark');else document.documentElement.removeAttribute('data-theme');try{localStorage.setItem('holioo-theme',on?'dark':'light')}catch{}document.querySelector('meta[name=theme-color]')?.setAttribute('content',on?'#0F1020':'#1689F5')});
  byId('guestToGoogle')?.addEventListener('click',()=>startGoogleLogin());
  byId('logoutBtn').onclick=guestMode?()=>openSheet({title:'Quitter le mode test ?',subtitle:'Vos cours de test restent sur cet appareil et réapparaîtront si vous revenez en mode test.',confirmText:'Quitter',onConfirm:()=>{signOut();return true}}):()=>openSheet({title:'Se déconnecter ?',subtitle:'Vos cours restent enregistrés sur cet appareil et réapparaîtront à votre prochaine connexion.',confirmText:'Se déconnecter',onConfirm:()=>{signOut();return true}});
  byId('avatarInput').onchange=async e=>{
    const file=e.target.files?.[0];
    if(!file)return;
    const allowed=['image/jpeg','image/png','image/webp'];
    if(!allowed.includes(file.type)){showToast('Format non pris en charge — utilisez JPG, PNG ou WebP');e.target.value='';return}
    if(file.size>5*1024*1024){showToast('La photo doit faire moins de 5 Mo');e.target.value='';return}
    if(!navigator.onLine||!sb||!currentUser){showToast('Internet est nécessaire pour ajouter une photo');e.target.value='';return}
    try{
      const path=`${currentUser.id}/avatar`;
      const{error}=await sb.storage.from('avatars').upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:true});
      if(error)throw error;
      const{data}=sb.storage.from('avatars').getPublicUrl(path);
      state.profile.avatarUrl=`${data.publicUrl}?v=${Date.now()}`;
      saveState();
      try{await syncProfile()}catch(syncError){console.warn('Avatar profile sync failed',syncError)}
      showToast('Photo de profil mise à jour');
      await render();
    }catch(error){
      console.error(error);
      showToast('Impossible de mettre à jour la photo');
    }finally{e.target.value=''}
  };
  byId('saveProfile').onclick=async()=>{Object.assign(state.profile,{displayName:byId('pName').value.trim()||'Étudiant',university:byId('pUni').value.trim(),faculty:byId('pFaculty').value.trim(),program:byId('pProgram').value.trim(),level:byId('pLevel').value.trim(),semester:byId('pSemester').value.trim(),academicYear:byId('pYear').value.trim()||'2026–2027',publicProfile:byId('pPublic').checked});saveState();try{await syncProfile();showToast('Profil enregistré')}catch{showToast('Profil enregistré localement')}render()};
  byId('copyHoliooId')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();copyHoliooId(p.holiooId).then(ok=>{if(!ok)return;const b=byId('copyHoliooId');if(b){b.innerHTML=icon('check',{size:15});setTimeout(()=>{if(byId('copyHoliooId'))byId('copyHoliooId').innerHTML=icon('copy',{size:15})},1500)}})});
  byId('searchId').onclick=()=>{if(guestMode||!currentUser){showToast('Connectez-vous avec Google pour ajouter des personnes');return}openPeopleSearchSheet(()=>navigate('people'))};
}
