'use strict';
const SUPABASE_URL='https://vznsvcotzurgmkmtvapm.supabase.co';
const SUPABASE_KEY='sb_publishable_eN8imVSNAXwp8-K9N3mbZw_ZJX0klU8';
const STORE_KEY='holioo_pwa_state_v3';
const LEGACY_KEY='holioo_pwa_state_v1';
const app=document.getElementById('app');
const appShell=document.getElementById('appShell');
const topbar=document.getElementById('topbar');
const bottomNav=document.getElementById('bottomNav');
const toastEl=document.getElementById('toast');
const offlineBanner=document.getElementById('offlineBanner');
const syncPill=document.getElementById('syncPill');
const syncText=document.getElementById('syncText');
const avatarBtn=document.getElementById('avatarBtn');
const sheetRoot=document.getElementById('sheetRoot');
const byId=id=>document.getElementById(id);
const DB=window.HoliooDB;
const Drive=window.HoliooDrive;
let sb=null,currentUser=null,cloudReady=false,driveStatus={connected:false,email:null};
let currentView='home',currentCourseId=null,currentSectionId=null,currentSessionId=null,currentBatch=null,currentLibrary={step:'years',year:null,course:null,section:null,item:null};
let cameraStream=null,cameraTrack=null,captureIds=[],cameraFacing='environment',torchOn=false,zoomValue=1,syncBusy=false;
let deferredInstallPrompt=null,drivePollTimer=null;
const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const iconLetter=s=>(String(s||'?').trim()[0]||'?').toUpperCase();
const fmtDate=s=>{try{return new Date(s).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})}catch{return''}};
const fmtShort=s=>{try{return new Date(s).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'})}catch{return''}};
const sectionClass=n=>n==='CM'?'cm':n==='TD'?'td':n==='TP'?'tp':'custom';
const sectionColor=n=>n==='CM'?'#506BFF':n==='TD'?'#8C5CF5':n==='TP'?'#FF9E42':'#29ADB5';
const defaultState=()=>({version:3,onboardingComplete:false,academicSetupSeen:false,profile:{displayName:'Étudiant',holiooId:'',university:'',faculty:'',program:'',level:'',semester:'',academicYear:'2026–2027',publicProfile:false},courses:[sampleCourse('VHDL','#8C5CF5'),sampleCourse('Mathématiques','#506BFF'),sampleCourse('Électronique','#FF9E42')],inbox:[],files:[],settings:{autoDriveSync:true}});
function sampleCourse(name,color){return{id:uid(),name,color,sections:['CM','TD','TP'].map((n,i)=>({id:uid(),name:n,type:n,sortOrder:i,sessions:[]}))}}
function loadState(){
  try{
    let raw=localStorage.getItem(STORE_KEY);if(!raw)raw=localStorage.getItem(LEGACY_KEY);
    const parsed=raw?JSON.parse(raw):null;if(!parsed)return defaultState();
    const base=defaultState();const merged={...base,...parsed,version:3,profile:{...base.profile,...parsed.profile},settings:{...base.settings,...parsed.settings}};
    merged.courses=Array.isArray(parsed.courses)&&parsed.courses.length?parsed.courses:base.courses;merged.inbox=Array.isArray(parsed.inbox)?parsed.inbox:[];merged.files=Array.isArray(parsed.files)?parsed.files:[];
    merged.courses.forEach(ensureDefaultSections);return merged;
  }catch(e){console.warn(e);return defaultState()}
}
let state=loadState();
function saveState(){localStorage.setItem(STORE_KEY,JSON.stringify(state))}
function ensureDefaultSections(course){course.sections=Array.isArray(course.sections)?course.sections:[];for(const [i,n] of ['CM','TD','TP'].entries())if(!course.sections.some(s=>s.name===n))course.sections.splice(i,0,{id:uid(),name:n,type:n,sortOrder:i,sessions:[]});for(const s of course.sections)s.sessions=Array.isArray(s.sessions)?s.sessions:[]}
state.courses.forEach(ensureDefaultSections);
if(state.captureDraft?.photoIds?.length){state.inbox.unshift({id:state.captureDraft.id||uid(),title:'Capture récupérée',photoIds:[...state.captureDraft.photoIds],createdAt:state.captureDraft.createdAt||now()});state.captureDraft=null;}
saveState();

function showToast(message){toastEl.textContent=message;toastEl.classList.remove('hidden');clearTimeout(showToast.t);showToast.t=setTimeout(()=>toastEl.classList.add('hidden'),3000)}
function pageHead(title,subtitle='',eyebrow='HOLIOO'){return`<div class="page-head"><p class="eyebrow">${esc(eyebrow)}</p><h1 class="page-title">${esc(title)}</h1>${subtitle?`<p class="subtitle">${esc(subtitle)}</p>`:''}</div>`}
function backButton(){return'<button class="back" id="backBtn" aria-label="Retour">‹</button>'}
function setChrome(hidden){appShell.classList.toggle('hidden-chrome',hidden)}
function setNav(view){document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===view))}
function navigate(view,payload={}){
  if(view!=='capture')stopCamera();currentView=view;
  if(payload.courseId)currentCourseId=payload.courseId;if(payload.sectionId)currentSectionId=payload.sectionId;if(payload.sessionId)currentSessionId=payload.sessionId;
  const mainViews=['home','courses','capture','library','files'];setNav(mainViews.includes(view)?view:'');setChrome(['welcome','academicSetup','capture','photoViewer','pdfViewer'].includes(view));render().catch(e=>{console.error(e);showToast('Une erreur est survenue')});
}
document.addEventListener('click',e=>{const n=e.target.closest('[data-nav]');if(n){e.preventDefault();navigate(n.dataset.nav)}});

function openSheet({title,subtitle='',body='',confirmText='Enregistrer',confirmClass='primary',onConfirm=null,secondaryText='Annuler',onSecondary=null}){
  sheetRoot.innerHTML=`<div class="sheet" id="activeSheet"><div class="sheet-card"><div class="sheet-handle"></div><h2 class="sheet-title">${esc(title)}</h2>${subtitle?`<p class="sheet-sub">${esc(subtitle)}</p>`:''}<div>${body}</div><div class="sheet-actions"><button class="btn ${confirmClass} full" id="sheetConfirm">${esc(confirmText)}</button>${secondaryText?`<button class="btn ghost full" id="sheetCancel">${esc(secondaryText)}</button>`:''}</div></div></div>`;
  const close=()=>sheetRoot.innerHTML='';document.getElementById('sheetCancel')?.addEventListener('click',async()=>{if(onSecondary)await onSecondary();close()});document.getElementById('activeSheet')?.addEventListener('click',e=>{if(e.target.id==='activeSheet')close()});document.getElementById('sheetConfirm').addEventListener('click',async()=>{const ok=onConfirm?await onConfirm(close):true;if(ok!==false&&sheetRoot.innerHTML)close()});
  return close;
}

function profilePayload(){const p=state.profile;return{id:currentUser?.id,user_id:currentUser?.id,holioo_id:p.holiooId,name:p.displayName,display_name:p.displayName,university:p.university||null,faculty:p.faculty||null,program:p.program||null,level:p.level||null,semester:p.semester||null,academic_year:p.academicYear||null,public_profile:p.publicProfile,is_public:p.publicProfile}}
async function bootstrapCloud(){
  if(!navigator.onLine||!window.supabase)return;
  try{
    const deviceId=localStorage.getItem('holioo_device_id')||`${crypto.randomUUID()}-${Date.now()}`;localStorage.setItem('holioo_device_id',deviceId);
    const r=await fetch(`${SUPABASE_URL}/functions/v1/device-bootstrap`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},body:JSON.stringify({device_id:deviceId})});
    const auth=await r.json();if(!r.ok)throw new Error(auth.error||'Connexion cloud impossible');
    sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});await sb.auth.setSession({access_token:auth.access_token,refresh_token:auth.refresh_token});currentUser=auth.user;cloudReady=true;
    const {data:profile}=await sb.from('profiles').select('*').eq('id',currentUser.id).maybeSingle();
    if(profile){state.profile={...state.profile,displayName:profile.name||profile.display_name||state.profile.displayName,holiooId:profile.holioo_id||state.profile.holiooId,university:profile.university??state.profile.university,faculty:profile.faculty??state.profile.faculty,program:profile.program??state.profile.program,level:profile.level??state.profile.level,semester:profile.semester??state.profile.semester,academicYear:profile.academic_year??state.profile.academicYear,publicProfile:!!(profile.public_profile||profile.is_public)};saveState()}
    else{const hid=`h${currentUser.id.replace(/-/g,'').slice(0,10)}`;state.profile.holiooId=hid;saveState();await sb.from('profiles').insert({...profilePayload(),holioo_id:hid})}
    try{driveStatus=await Drive.status(sb,currentUser.id)}catch{driveStatus={connected:false,email:null}}
    sb.channel('public-materials-live').on('postgres_changes',{event:'*',schema:'public',table:'public_materials'},()=>{if(currentView==='library')render()}).subscribe();
    await refreshSyncIndicator();if(driveStatus.connected&&state.settings.autoDriveSync)queueSync('bootstrap');
  }catch(e){console.error(e);cloudReady=false;showToast('Mode local actif — synchronisation plus tard');await refreshSyncIndicator()}
}
async function syncProfile(){if(sb&&currentUser&&navigator.onLine){const{error}=await sb.from('profiles').upsert(profilePayload(),{onConflict:'id'});if(error)throw error}}
async function refreshSyncIndicator(){
  let pending=0;try{pending=await Drive.pendingCount(state,DB)}catch{}
  syncPill.classList.remove('online','pending','error');
  if(!navigator.onLine){syncText.textContent='Hors ligne';return}
  if(syncBusy){syncPill.classList.add('pending');syncText.textContent='Sync…';return}
  if(driveStatus.connected){syncPill.classList.add(pending?'pending':'online');syncText.textContent=pending?`${pending} à sync`:'Drive OK'}else{syncText.textContent=pending?'Local':'Local'}
}
function queueSync(reason='auto'){clearTimeout(queueSync.t);queueSync.t=setTimeout(()=>runDriveSync(reason),600)}
async function runDriveSync(reason='manual'){
  if(syncBusy||!navigator.onLine||!sb||!currentUser)return;syncBusy=true;await refreshSyncIndicator();
  try{
    driveStatus=await Drive.status(sb,currentUser.id);if(!driveStatus.connected){if(reason==='manual')showToast('Connectez Google Drive d’abord');return}
    const result=await Drive.syncAll({sb,user:currentUser,state,db:DB,onProgress:()=>refreshSyncIndicator()});if(reason==='manual'||result.synced)showToast(result.synced?`${result.synced} élément(s) synchronisé(s)`:'Tout est déjà synchronisé');
  }catch(e){console.error(e);syncPill.classList.add('error');if(reason==='manual')showToast(`Sync impossible : ${e.message||e}`)}finally{syncBusy=false;await refreshSyncIndicator();if(currentView==='sync')render()}
}

function courseCard(c){const sessions=c.sections.reduce((a,s)=>a+(s.sessions?.length||0),0),photos=c.sections.reduce((a,s)=>a+s.sessions.reduce((x,q)=>x+(q.photoIds?.length||0),0),0);return`<button class="card row card-button" data-course="${c.id}"><span class="course-icon" style="background:${c.color||'#506BFF'}">${esc(iconLetter(c.name))}</span><span class="grow"><span class="title">${esc(c.name)}</span><span class="meta">${sessions} séance${sessions>1?'s':''} • ${photos} photo${photos>1?'s':''}</span></span><span class="chev">›</span></button>`}
function bindCourseCards(){document.querySelectorAll('[data-course]').forEach(b=>b.onclick=()=>{currentCourseId=b.dataset.course;navigate('course')})}
function getCourse(id=currentCourseId){return state.courses.find(c=>c.id===id)}
function getSection(course=getCourse(),id=currentSectionId){return course?.sections.find(s=>s.id===id)}
function getSession(section=getSection(),id=currentSessionId){return section?.sessions.find(s=>s.id===id)}
function findSessionContext(sessionId=currentSessionId){for(const course of state.courses)for(const section of course.sections)for(const session of section.sessions)if(session.id===sessionId)return{course,section,session};return null}
