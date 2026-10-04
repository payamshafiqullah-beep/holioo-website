'use strict';
const SUPABASE_URL='https://vznsvcotzurgmkmtvapm.supabase.co';
const SUPABASE_KEY='sb_publishable_eN8imVSNAXwp8-K9N3mbZw_ZJX0klU8';
const STORE_KEY='holioo_pwa_state_v3';
const LEGACY_KEY='holioo_pwa_state_v1';
const app=document.getElementById('app');
const appShell=document.getElementById('appShell');
const bottomNav=document.getElementById('bottomNav');
const toastEl=document.getElementById('toast');
const offlineBanner=document.getElementById('offlineBanner');
const sheetRoot=document.getElementById('sheetRoot');
const byId=id=>document.getElementById(id);
const DB=window.HoliooDB;
const Drive=window.HoliooDrive;
let sb=null,currentUser=null,cloudReady=false,currentRole='user',accountBlocked=false,driveStatus={connected:false,email:null};
let currentView='home',currentCourseId=null,currentSectionId=null,currentSessionId=null,currentBatch=null,currentLibrary={step:'years',year:null,course:null,section:null,item:null};
let cameraStream=null,cameraTrack=null,captureIds=[],cameraFacing='environment',torchOn=false,zoomValue=1,syncBusy=false;
let deferredInstallPrompt=null,drivePollTimer=null,libraryChannel=null,appUpdateReady=false;
const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const iconLetter=s=>(String(s||'?').trim()[0]||'?').toUpperCase();
const fmtDate=s=>{try{return new Date(s).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})}catch{return''}};
const fmtShort=s=>{try{return new Date(s).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'})}catch{return''}};
const sectionClass=n=>n==='CM'?'cm':n==='TD'?'td':n==='TP'?'tp':'custom';
const sectionColor=n=>n==='CM'?'#506BFF':n==='TD'?'#8C5CF5':n==='TP'?'#FF9E42':'#29ADB5';
const defaultState=()=>({version:3,onboardingComplete:false,academicSetupSeen:false,profile:{displayName:'Étudiant',holiooId:'',avatarUrl:'',university:'',faculty:'',program:'',level:'',semester:'',academicYear:'2026–2027',publicProfile:false},courses:[sampleCourse('VHDL','#8C5CF5'),sampleCourse('Mathématiques','#506BFF'),sampleCourse('Électronique','#FF9E42')],inbox:[],files:[],favorites:[],settings:{autoDriveSync:true,drawWithFinger:false}});
const MAX_COURSES=7,COURSE_LIMIT_MESSAGE='Maximum 7 cours';
const courseLimitReached=()=>state.courses.length>=MAX_COURSES;
// The only way to add a course: refuses at the limit (the sheet and the buttons check it too), and gives the new course the first icon its owner's other courses do not use.
function addCourse(name,color){
  if(courseLimitReached())return null;
  const course=sampleCourse(name,color);course.icon=nextCourseIcon(state.courses);
  state.courses.push(course);return course;
}
function sampleCourse(name,color){return{id:uid(),name,color,defaultSectionsSeeded:true,sections:['CM','TD','TP'].map((n,i)=>({id:uid(),name:n,type:n,sortOrder:i,sessions:[]}))}}
// Local data is kept per Google account on this device. The first account to sign in
// on a device inherits the data saved before accounts existed.
let stateOwner=localStorage.getItem('holioo_last_uid')||'';
// Test mode without an account (until Google verification): local only, never touches the server.
const GUEST='guest';
let guestMode=stateOwner===GUEST;
const stateKey=()=>stateOwner?`${STORE_KEY}:${stateOwner}`:STORE_KEY;
function loadState(){
  try{
    let raw=localStorage.getItem(stateKey());if(!raw&&stateOwner)raw=localStorage.getItem(STORE_KEY)||localStorage.getItem(LEGACY_KEY);
    let parsed=null;
    try{parsed=raw?JSON.parse(raw):null}catch(e){
      // Never overwrite unreadable data with an empty state: keep a copy that can be recovered.
      console.warn('Holioo state unreadable, backed up',e);try{localStorage.setItem(`${stateKey()}:backup-${Date.now()}`,raw)}catch{}
    }
    if(!parsed)return defaultState();
    const base=defaultState();const merged={...base,...parsed,version:3,profile:{...base.profile,...parsed.profile},settings:{...base.settings,...parsed.settings}};
    merged.courses=Array.isArray(parsed.courses)?parsed.courses:base.courses;merged.inbox=Array.isArray(parsed.inbox)?parsed.inbox:[];merged.files=Array.isArray(parsed.files)?parsed.files:[];merged.favorites=Array.isArray(parsed.favorites)?parsed.favorites:[];
    merged.courses.forEach(ensureDefaultSections);return merged;
  }catch(e){console.warn(e);return defaultState()}
}
let state=loadState();
// The part of the state other devices of the account share (features/cloud-sync.js). A change in it stamps
// `lastModified`, which decides who wins when two devices changed the same thing; `saveState.quiet` is for saves
// made by the sync itself.
const structSigOf=()=>JSON.stringify([state.courses,state.inbox,state.files,state.favorites,state.timetable]);
let structSig=structSigOf();
// Baseline for Supabase signal diffing (features/state-merge.js); null before the first save.
let syncBaseline=null;
function saveState({remote=false}={}){
  const sig=structSigOf();
  if(sig!==structSig){structSig=sig;if(!saveState.quiet)state.lastModified=Date.now()}
  let changed=false;
  try{if(remote)syncBaseline=typeof syncFlatten==='function'?syncFlatten(state):null;else if(typeof syncStamp==='function'){const r=syncStamp(state,syncBaseline);syncBaseline=r.flat;changed=r.changed}}catch(e){console.warn(e)}
  try{localStorage.setItem(stateKey(),JSON.stringify(state))}
  catch(e){console.warn(e);if(!saveState.warned){saveState.warned=true;showToast('Stockage plein : libérez de l’espace sur l’appareil');setTimeout(()=>saveState.warned=false,10000)}}
  // The camera sends its photos once it is left (capture-actions.js); everything else goes to Drive soon.
  if(changed&&currentUser&&!guestMode&&!['capture','scanReview'].includes(currentView))queueSync('state');
}
function switchStateOwner(uid){
  if(uid===stateOwner)return;
  // Signing in with Google after test mode keeps what was done in test mode.
  const guestData=stateOwner===GUEST&&uid&&uid!==GUEST&&!localStorage.getItem(`${STORE_KEY}:${uid}`)?localStorage.getItem(stateKey()):null;
  if(guestData)localStorage.setItem(`${STORE_KEY}:${uid}`,guestData);
  guestMode=uid===GUEST;
  stateOwner=uid;if(uid)localStorage.setItem('holioo_last_uid',uid);else localStorage.removeItem('holioo_last_uid');
  state=loadState();structSig=structSigOf();syncBaseline=null;saveState();
  if(uid){localStorage.removeItem(STORE_KEY);localStorage.removeItem(LEGACY_KEY)}
}
// CM / TD / TP are created once per course (defaultSectionsSeeded); after that a deleted section is not brought back.
function ensureDefaultSections(course){course.sections=Array.isArray(course.sections)?course.sections:[];if(!course.defaultSectionsSeeded){for(const [i,n] of ['CM','TD','TP'].entries())if(!course.sections.some(s=>s.name===n))course.sections.splice(i,0,{id:uid(),name:n,type:n,sortOrder:i,sessions:[]});course.defaultSectionsSeeded=true}for(const s of course.sections)s.sessions=Array.isArray(s.sessions)?s.sessions:[]}
state.courses.forEach(ensureDefaultSections);
if(state.captureDraft?.photoIds?.length){state.inbox.unshift({id:state.captureDraft.id||uid(),title:'Capture récupérée',photoIds:[...state.captureDraft.photoIds],createdAt:state.captureDraft.createdAt||now()});state.captureDraft=null;}
saveState();

function showToast(message){toastEl.textContent=message;toastEl.classList.remove('hidden');clearTimeout(showToast.t);showToast.t=setTimeout(()=>toastEl.classList.add('hidden'),3000)}
function setChrome(hidden){appShell.classList.toggle('hidden-chrome',hidden)}
function setNav(view){document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===view))}
function navigate(view,payload={}){
  if(view==='home'&&appUpdateReady&&reloadIfSafe())return;
  if(view==='capture'&&currentView!=='capture')prepareCameraEntry(currentView,payload.cameraDest);
  appShell.classList.toggle('capture-active',view==='capture');
  if(view!=='capture')stopCamera();if(currentView==='scanReview'&&view!=='scanReview'&&typeof flushScanDelete==='function')flushScanDelete();if(currentView==='session'&&view!=='session'&&typeof flushNotebook==='function')flushNotebook();currentView=view;
  if(payload.courseId)currentCourseId=payload.courseId;if(payload.sectionId)currentSectionId=payload.sectionId;if(payload.sessionId)currentSessionId=payload.sessionId;
  const mainViews=['home','courses','capture','library','files'];setNav(mainViews.includes(view)?view:'');setChrome(['login','blocked','academicSetup','photoViewer','pdfViewer','capture','scanReview','admin','sharedViewer'].includes(view));window.scrollTo(0,0);render().catch(e=>{console.error(e);showToast('Une erreur est survenue')});
}
document.addEventListener('click',e=>{const n=e.target.closest('[data-nav]');if(n){e.preventDefault();navigate(n.dataset.nav)}});

function openSheet({title,subtitle='',body='',confirmText='Enregistrer',confirmClass='primary',onConfirm=null,secondaryText='Annuler',onSecondary=null}){
  sheetRoot.innerHTML=`<div class="sheet" id="activeSheet"><div class="sheet-card"><div class="sheet-handle"></div><h2 class="sheet-title">${esc(title)}</h2>${subtitle?`<p class="sheet-sub">${esc(subtitle)}</p>`:''}<div>${body}</div><div class="sheet-actions"><button class="action-btn ${confirmClass==='coral'?'danger':'primary'} full" id="sheetConfirm">${esc(confirmText)}</button>${secondaryText?`<button class="action-btn ghost full" id="sheetCancel">${esc(secondaryText)}</button>`:''}</div></div></div>`;
  const close=()=>sheetRoot.innerHTML='';document.getElementById('sheetCancel')?.addEventListener('click',async()=>{if(onSecondary)await onSecondary();close()});document.getElementById('activeSheet')?.addEventListener('click',e=>{if(e.target.id==='activeSheet')close()});document.getElementById('sheetConfirm').addEventListener('click',async()=>{const ok=onConfirm?await onConfirm(close):true;if(ok!==false&&sheetRoot.innerHTML)close()});
  return close;
}

function profilePayload(){const p=state.profile;return{id:currentUser?.id,user_id:currentUser?.id,holioo_id:p.holiooId,name:p.displayName,display_name:p.displayName,university:p.university||null,faculty:p.faculty||null,program:p.program||null,level:p.level||null,semester:p.semester||null,academic_year:p.academicYear||null,avatar_url:p.avatarUrl||null,public_profile:p.publicProfile,is_public:p.publicProfile}}
const supabaseClient=()=>sb??=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'holioo-auth'}});

// After Google, the server sends the browser back with #holioo_login=<one-time code>.
async function completeGoogleLogin(){
  const code=new URLSearchParams(location.hash.slice(1)).get('holioo_login');if(!code)return;
  history.replaceState(null,'',location.pathname+location.search);
  try{
    const r=await fetch(`${SUPABASE_URL}/functions/v1/google-login-exchange`,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY},body:JSON.stringify({code})});
    const t=await r.json();if(!r.ok)throw new Error(t.error||'Connexion impossible');
    const{error}=await supabaseClient().auth.setSession(t);if(error)throw error;
  }catch(e){console.error(e);showToast(e.message||'Connexion impossible')}
}

function startGoogleLogin({consent=false}={}){
  const back=`${location.origin}${location.pathname}`;
  location.href=`${SUPABASE_URL}/functions/v1/google-login-start?return_to=${encodeURIComponent(back)}${consent?'&consent=1':''}`;
}

function enterGuestMode(){switchStateOwner(GUEST);navigate('home')}

async function signOut(){
  if(typeof stopRemoteSync==='function')stopRemoteSync();
  try{await sb?.auth.signOut()}catch{}
  currentUser=null;cloudReady=false;currentRole='user';driveStatus={connected:false,email:null};
  switchStateOwner('');navigate('login');
}

async function bootstrapCloud(){
  if(!window.supabase)return;
  try{
    await completeGoogleLogin();
    const{data:{session}}=await supabaseClient().auth.getSession();
    if(!session){currentUser=null;cloudReady=false;return}
    currentUser=session.user;switchStateOwner(currentUser.id);
    if(!navigator.onLine)return;
    const {data:profile,error}=await sb.from('profiles').select('*').eq('id',currentUser.id).maybeSingle();
    if(error&&/JWT|session|auth/i.test(error.message)){await signOut();return}
    cloudReady=true;currentRole=profile?.role||'user';accountBlocked=!!profile?.blocked;
    if(profile){state.profile={...state.profile,displayName:profile.name||profile.display_name||state.profile.displayName,holiooId:profile.holioo_id||state.profile.holiooId,university:profile.university??state.profile.university,faculty:profile.faculty??state.profile.faculty,program:profile.program??state.profile.program,level:profile.level??state.profile.level,semester:profile.semester??state.profile.semester,academicYear:profile.academic_year??state.profile.academicYear,publicProfile:!!(profile.public_profile||profile.is_public),email:profile.email||currentUser.email,avatarUrl:profile.avatar_url??state.profile.avatarUrl};saveState()}
    else{const hid=`h${currentUser.id.replace(/-/g,'').slice(0,10)}`;state.profile.holiooId=hid;saveState();await sb.from('profiles').insert({...profilePayload(),holioo_id:hid})}
    if(accountBlocked)return;
    try{driveStatus=await Drive.status(sb,currentUser.id)}catch{driveStatus={connected:false,email:null}}
    if(typeof startSyncSignals==='function')startSyncSignals();
    libraryChannel??=sb.channel('public-materials-live').on('postgres_changes',{event:'*',schema:'public',table:'public_materials'},()=>{if(currentView==='library')render()}).subscribe();
    await refreshSyncIndicator();if(driveStatus.connected&&state.settings.autoDriveSync)queueSync('bootstrap');
  }catch(e){console.error(e);cloudReady=false;showToast('Mode local actif — synchronisation plus tard');await refreshSyncIndicator()}
}
async function syncProfile(){if(sb&&currentUser&&navigator.onLine){const{error}=await sb.from('profiles').upsert(profilePayload(),{onConflict:'id'});if(error)throw error}}
// Besides photos and PDFs, Drive keeps the session notebooks (features/notebook-ink.js), typed notes (features/notes.js)
// and Notes pages (features/canvas-sync.js).
const driveDocuments=()=>{
  const makers=[typeof notebookDriveDocuments==='function'?notebookDriveDocuments:null,typeof notesDriveDocuments==='function'?notesDriveDocuments:null,typeof canvasDriveDocuments==='function'?canvasDriveDocuments:null].filter(Boolean);
  return makers.length?async s=>(await Promise.all(makers.map(m=>m(s)))).flat():null;
};
async function refreshSyncIndicator(){
  let pending=0;try{pending=await Drive.pendingCount(state,DB,driveDocuments())}catch{}
  if(!navigator.onLine)syncIndicator={cls:'offline',text:'Hors ligne'};
  else if(syncBusy)syncIndicator={cls:'pending',text:'Synchronisation…'};
  else if(driveStatus.connected)syncIndicator=pending?{cls:'pending',text:`${pending} élément(s) à synchroniser`}:{cls:'online',text:'Google Drive à jour'};
  else syncIndicator={cls:'',text:'Enregistré sur cet appareil'};
  applyChromeStatus();
}
function queueSync(reason='auto'){clearTimeout(queueSync.t);queueSync.t=setTimeout(()=>runDriveSync(reason),600)}
async function runDriveSync(reason='manual'){
  // A change made during a sync is sent by a second run right after it.
  if(syncBusy){if(navigator.onLine)runDriveSync.again=reason;return}
  if(!navigator.onLine||!sb||!currentUser)return;
  // "Synchroniser automatiquement" off: only an explicit tap syncs.
  if(reason!=='manual'&&!state.settings.autoDriveSync)return;
  syncBusy=true;await refreshSyncIndicator();
  try{
    driveStatus=await Drive.status(sb,currentUser.id);if(!driveStatus.connected){if(reason==='manual')showToast('Connectez Google Drive d’abord');return}
    const result=await Drive.syncAll({sb,user:currentUser,state,db:DB,documents:driveDocuments(),
      save:()=>{saveState.quiet=true;try{saveState()}finally{saveState.quiet=false}},
      onDocument:(d,files)=>{if(typeof notesDocumentSent==='function')notesDocumentSent(d,files);if(typeof canvasDocumentSent==='function')canvasDocumentSent(d,files)},
      onProgress:({checked,total,phase})=>{syncIndicator={cls:'pending',text:`${phase==='pull'?'Réception':'Synchronisation'}… ${checked}/${total}`};applyChromeStatus()}});
    // What the account’s other devices added or removed is now here: show it where that is safe (not in the camera,
    // the photo viewer, a notebook being written in, a form being filled).
    const news=(result.received||0)+(result.changed?1:0);
    if(news&&['home','courses','course','section','gallery','files','inbox','sync','library','profile'].includes(currentView))render();
    if(result.failed){console.warn('Drive sync:',result.lastError);showToast(`${result.failed} élément(s) non synchronisé(s) — nouvel essai plus tard`)}
    else if(result.receivedFailed)showToast(`${result.receivedFailed} élément(s) de vos autres appareils n’ont pas pu être reçus — nouvel essai plus tard`);
    else if(result.received)showToast(`${result.received} élément(s) reçu(s) de vos autres appareils`);
    else if(reason==='manual'||result.synced)showToast(result.synced?`${result.synced} élément(s) synchronisé(s)`:result.changed?'Vos autres appareils sont à jour ici':'Tout est déjà synchronisé');
  }catch(e){console.error(e);syncIndicator={cls:'error',text:'Erreur de synchronisation'};applyChromeStatus();if(e?.code==='DRIVE_FULL')showToast('Google Drive est plein : libérez de l’espace pour continuer la sauvegarde');else if(reason==='manual')showToast(`Sync impossible : ${e.message||e}`)}finally{syncBusy=false;await refreshSyncIndicator();if(currentView==='sync')render();const again=runDriveSync.again;runDriveSync.again=null;if(again)queueSync(again==='manual'?'auto':again)}
}

function bindCourseCards(){document.querySelectorAll('[data-course]').forEach(b=>b.onclick=()=>{currentCourseId=b.dataset.course;navigate('course')})}
function getCourse(id=currentCourseId){return state.courses.find(c=>c.id===id)}
function getSection(course=getCourse(),id=currentSectionId){return course?.sections.find(s=>s.id===id)}
function getSession(section=getSection(),id=currentSessionId){return section?.sessions.find(s=>s.id===id)}
function findSessionContext(sessionId=currentSessionId){for(const course of state.courses)for(const section of course.sections)for(const session of section.sessions)if(session.id===sessionId)return{course,section,session};return null}
