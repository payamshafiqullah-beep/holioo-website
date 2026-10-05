'use strict';
// Anonymous usage counting for the owner (supabase/functions/app-ping, shown in Administration).
// Nothing is displayed to users. Only a random id of this device, its kind of screen and the app
// version are sent, while the app is open and visible; no content, no location.
const ACTIVITY_BEAT_MS=4*60*1000;       // heartbeat while the app is open (the server counts "online" as seen in the last 10 minutes)
const ACTIVITY_REOPEN_MS=30*60*1000;    // away longer than this: the next ping counts as a new launch
const ACTIVITY_RETRY_MS=60*60*1000;     // the server answered with an error (e.g. its tables are missing): wait before trying again
const ACTIVITY_VERSION=(document.currentScript?.src.match(/[?&]v=([^&]+)/)||[])[1]||'';
let activityLastPing=0;
let activityPausedUntil=0;

function activityDeviceId(){
  let id='';
  try{id=localStorage.getItem('holioo_device_id')||''}catch{}
  if(!/^[0-9a-f-]{36}$/i.test(id)){
    id=crypto.randomUUID();
    try{localStorage.setItem('holioo_device_id',id)}catch{}
  }
  return id;
}

function activityPlatform(){
  const ua=navigator.userAgent||'';
  if(/iPad/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1))return'ipad';
  if(/iPhone/.test(ua))return'iphone';
  if(/Android/.test(ua))return'android';
  return'desktop';
}

async function activityTick(){
  if(!(currentUser||guestMode)||document.visibilityState!=='visible'||!navigator.onLine)return;
  const now=Date.now();
  if(now<activityPausedUntil)return;
  if(activityLastPing&&now-activityLastPing<ACTIVITY_BEAT_MS)return;
  const event=!activityLastPing||now-activityLastPing>ACTIVITY_REOPEN_MS?'open':'beat';
  activityLastPing=now;
  try{
    const{error}=await sb.functions.invoke('app-ping',{body:{deviceId:activityDeviceId(),event,platform:activityPlatform(),version:ACTIVITY_VERSION}});
    if(error)activityPausedUntil=Date.now()+ACTIVITY_RETRY_MS;
  }catch{activityPausedUntil=Date.now()+ACTIVITY_RETRY_MS}
}

setTimeout(activityTick,3000);
setInterval(activityTick,30000);
document.addEventListener('visibilitychange',activityTick);
