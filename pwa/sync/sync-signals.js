(function(){
  'use strict';
  // Real-time signals between the devices of one account, through Supabase (table sync_signals, Realtime).
  // A signal carries ids only ("state.json changed", "photo <id> is in Drive"): what changed is always read
  // from the user's Drive. Presence on the account's channel says which devices are open, and whether a
  // tablet is waiting for photos (Live Capture).
  const DEVICE_KEY='holioo_device_id';   // same id as the activity counter (features/admin/activity.js)
  let channel=null,owner=null,sbRef=null,mine={};
  const peerListeners=new Set();

  function deviceId(){
    let id='';try{id=localStorage.getItem(DEVICE_KEY)||''}catch{}
    if(!/^[0-9a-f-]{36}$/i.test(id)){id=crypto.randomUUID();try{localStorage.setItem(DEVICE_KEY,id)}catch{}}
    return id;
  }
  const fromRow=r=>({kind:r.kind,refId:r.ref_id||null,sessionId:r.session_id||null,driveFileId:r.drive_file_id||null,rev:r.rev||null,device:r.device_id,at:r.created_at});
  // Signals from this device are ignored; so are rows of another account (RLS already filters them).
  const accept=(row,userId,me)=>!!row&&row.user_id===userId&&row.device_id!==me;

  async function send(sb,{kind,refId=null,sessionId=null,driveFileId=null,rev=null}){
    const{error}=await sb.from('sync_signals').insert({device_id:deviceId(),kind,ref_id:refId,session_id:sessionId,drive_file_id:driveFileId,rev});
    if(error)throw error;
  }

  function peers(){
    const st=channel?.presenceState?.()||{},me=deviceId(),out=[];
    for(const[key,metas]of Object.entries(st))if(key!==me&&metas?.length)out.push({device:key,...metas[metas.length-1]});
    return out;
  }
  const emitPeers=()=>{const p=peers();for(const fn of peerListeners)try{fn(p)}catch{}};

  function start(sb,userId,onSignal){
    if(channel&&owner===userId)return;
    stop();
    sbRef=sb;owner=userId;const me=deviceId();
    channel=sb.channel(`holioo-sync:${userId}`,{config:{presence:{key:me}}})
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'sync_signals',filter:`user_id=eq.${userId}`},p=>{if(accept(p.new,userId,me))onSignal(fromRow(p.new))})
      .on('presence',{event:'sync'},emitPeers)
      .subscribe(status=>{if(status==='SUBSCRIBED')channel?.track({...mine,at:Date.now()}).catch(()=>{})});
  }
  function stop(){
    if(channel){try{sbRef?.removeChannel(channel)}catch{}}
    channel=null;owner=null;emitPeers();
  }
  // What this device tells the others: {desk, live, sessionId}.
  function track(fields){
    mine={...mine,...fields};
    channel?.track({...mine,at:Date.now()}).catch(()=>{});
  }
  function onPeers(fn){peerListeners.add(fn);return()=>peerListeners.delete(fn)}

  window.HoliooSignals={deviceId,send,start,stop,track,peers,onPeers,_accept:accept,_fromRow:fromRow};
})();
