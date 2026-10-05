// Connexion — obligatoire, avec Google (connexion + autorisation Google Drive en un écran).
function GoogleLogo(){return`<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`}

function renderLogin(){
  const feature=(name,tone,title,text)=>`<div class="feature-row">${IconBadge(name,tone,'md')}<span class="list-card-copy"><strong>${title}</strong><small>${text}</small></span></div>`;
  const offline=!navigator.onLine;
  app.innerHTML=`<section class="onboarding">
    <div>
      <span class="wordmark large" aria-label="Holioo">Holioo<i></i></span>
      <div class="onboarding-art">${HeroIllustration()}</div>
      <h1 class="hero-title">Vos cours. Capturés, organisés, retrouvés.</h1>
      <p class="lead">Connectez-vous avec votre compte Google. Vos cours seront sauvegardés dans votre propre Google Drive.</p>
      <div class="list-stack">
        ${feature('camera','peach','Capture immédiate','Chaque photo est rangée directement dans le bon cours.')}
        ${feature('hardDrive','lavender','Local-first','Vos photos restent disponibles sans Internet.')}
        ${feature('cloud','mint','Votre Google Drive','Holioo n’accède qu’aux fichiers qu’il crée.')}
      </div>
    </div>
    <div class="button-stack">
      ${offline?Notice(`${icon('wifiOff',{size:18})}<span>Connexion Internet nécessaire pour vous connecter la première fois.</span>`,'peach'):''}
      <button class="action-btn google-btn full" id="googleLogin" ${offline?'disabled':''}>${GoogleLogo()}<span>Continuer avec Google</span></button>
      ${ActionButton({label:'Essayer sans compte',id:'guestLogin',variant:'ghost'})}
      <p class="legal-links">Mode test : tout reste sur cet appareil, sans synchronisation ni bibliothèque partagée.</p>
      <p class="legal-links">En continuant, vous acceptez les <a href="/conditions.html" target="_blank" rel="noopener">conditions d’utilisation</a> et la <a href="/confidentialite.html" target="_blank" rel="noopener">politique de confidentialité</a>.</p>
    </div>
  </section>`;
  byId('googleLogin').onclick=()=>{byId('googleLogin').disabled=true;startGoogleLogin()};
  byId('guestLogin').onclick=enterGuestMode;
}

function renderBlocked(){
  app.innerHTML=`<section class="onboarding">
    <div>
      <span class="wordmark large" aria-label="Holioo">Holioo<i></i></span>
      ${EmptyState({iconName:'x',title:'Accès suspendu',text:'Votre accès à Holioo a été suspendu par l’administrateur. Vos données locales restent sur cet appareil.'})}
    </div>
    <div class="button-stack">${ActionButton({label:'Se déconnecter',id:'blockedLogout',variant:'ghost'})}</div>
  </section>`;
  byId('blockedLogout').onclick=()=>{accountBlocked=false;signOut()};
}
