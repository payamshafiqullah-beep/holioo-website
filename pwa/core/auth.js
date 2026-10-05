'use strict';
// Google sign-in, test mode, sign-out and the profile loaded when the app starts.
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