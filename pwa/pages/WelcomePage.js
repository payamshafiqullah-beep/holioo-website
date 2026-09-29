// Bienvenue — premier lancement.
function renderWelcome(){
  setChrome(true);
  const feature=(name,tone,title,text)=>`<div class="feature-row">${IconBadge(name,tone,'md')}<span class="list-card-copy"><strong>${title}</strong><small>${text}</small></span></div>`;
  app.innerHTML=`<section class="onboarding">
    <div>
      <span class="wordmark large" aria-label="Holioo">Holioo<i></i></span>
      <div class="onboarding-art">${HeroIllustration()}</div>
      <h1 class="hero-title">Vos cours. Capturés, organisés, retrouvés.</h1>
      <p class="lead">Holioo enregistre d’abord sur votre appareil. Photographiez sans choisir de cours, organisez ensuite.</p>
      <div class="list-stack">
        ${feature('camera','peach','Capture immédiate','Aucun CM/TD/TP à choisir avant la photo.')}
        ${feature('hardDrive','lavender','Local-first','Vos photos restent disponibles sans Internet.')}
        ${feature('cloud','mint','Synchronisation','Google Drive sauvegarde au retour d’Internet.')}
      </div>
    </div>
    <div class="button-stack">
      ${ActionButton({label:'Commencer',id:'welcomeStart',iconName:'arrowRight'})}
      ${ActionButton({label:'Utiliser hors ligne',id:'welcomeSkip',variant:'ghost'})}
    </div>
  </section>`;
  byId('welcomeStart').onclick=()=>navigate('academicSetup');
  byId('welcomeSkip').onclick=()=>{state.onboardingComplete=true;state.academicSetupSeen=true;saveState();navigate('home')};
}
