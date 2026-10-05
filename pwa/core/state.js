'use strict';
// The saved state: default data, loading and saving, switching between accounts, adding courses.
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
// The part of the state other devices of the account share (sync/cloud-sync.js). A change in it stamps
// `lastModified`, which decides who wins when two devices changed the same thing; `saveState.quiet` is for saves
// made by the sync itself.
const structSigOf=()=>JSON.stringify([state.courses,state.inbox,state.files,state.favorites,state.timetable]);
let structSig=structSigOf();
// Baseline for Supabase signal diffing (sync/state-merge.js); null before the first save.
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