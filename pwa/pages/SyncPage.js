// Synchronisation — Google Drive et installation de l'app.
async function renderSync(){
  setChrome(false);
  // Guest mode: nothing can reach Drive without an account, so no "à synchroniser" count.
  let pending=0;if(!guestMode)try{pending=await Drive.pendingCount(state,DB,driveDocuments())}catch{}
  const onDevice=new Set([...state.courses.flatMap(c=>c.sections.flatMap(s=>s.sessions.flatMap(q=>q.photoIds||[]))),...state.inbox.flatMap(b=>b.photoIds||[])]).size;
  const connected=!!driveStatus.connected;
  app.innerHTML=`<section class="screen">
    ${PageHeader({back:true,title:'Profil',actions:false})}
    ${PageIntro({eyebrow:'GOOGLE DRIVE',title:'Synchronisation',subtitle:'Local-first : capture immédiate sur l’appareil, puis sauvegarde quand Internet revient.'})}
    <div class="list-card static${connected?' success':''}">${IconBadge('cloud',connected?'mint':'sky','md')}<span class="list-card-copy"><strong>${connected?'Google Drive connecté':'Google Drive non connecté'}</strong><small>${connected?esc(driveStatus.email||'Compte Google connecté'):'Chaque utilisateur connecte son propre Google Drive.'}</small></span>${Tag(connected?'Actif':'Local',connected?'mint':'neutral')}</div>
    ${guestMode?Notice(`${icon('user',{size:18})}<span>Mode test sans compte : tout reste sur cet appareil, rien n’est envoyé. Connectez-vous avec Google pour sauvegarder dans Drive.</span>`,'peach'):''}
    ${SectionTitle('État local')}
    <div class="stat-grid three">
      ${guestMode?StatCard({tone:'peach',iconName:'image',value:onDevice,label:'Photos sur l’appareil'}):StatCard({tone:'peach',iconName:'refresh',value:pending,label:'À synchroniser'})}
      ${StatCard({tone:'pink',iconName:'fileText',value:state.files.length,label:'PDF locaux'})}
      ${StatCard({tone:'lavender',iconName:'inbox',value:state.inbox.reduce((a,b)=>a+b.photoIds.length,0),label:'Captures'})}
    </div>
    ${SectionTitle('Comportement')}
    <label class="toggle-card"><span class="list-card-copy"><strong>Synchroniser automatiquement</strong><small>Dès que l’appareil retrouve Internet.</small></span><input type="checkbox" id="autoSync" class="switch" ${state.settings.autoDriveSync?'checked':''}></label>
    <div class="button-stack">
      ${connected?`${ActionButton({label:'Synchroniser maintenant',id:'syncNow',iconName:'refresh'})}${ActionButton({label:'Déconnecter Google Drive',id:'disconnectDrive',variant:'ghost',iconName:'x'})}`:ActionButton({label:'Connecter mon Google Drive',id:'connectDrive',iconName:'cloud'})}
      ${ActionButton({label:'Installer Holioo sur l’écran d’accueil',id:'installPwa',variant:'soft',iconName:'phone'})}
    </div>
    ${Notice(`${icon('checkCircle',{size:18})}<span>Les fichiers synchronisés restent accessibles depuis Google Drive sur un ordinateur même si le téléphone est éteint.</span>`,'mint')}
  </section>`;
  byId('backBtn').onclick=()=>navigate('profile');
  byId('autoSync').onchange=()=>{state.settings.autoDriveSync=byId('autoSync').checked;saveState()};
  byId('syncNow')?.addEventListener('click',()=>runDriveSync('manual'));
  byId('disconnectDrive')?.addEventListener('click',()=>disconnectDrive());
  byId('connectDrive')?.addEventListener('click',()=>connectDrive());
  byId('installPwa').onclick=showInstallSheet;
}
