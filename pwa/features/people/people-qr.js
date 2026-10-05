// People, unread badge, the Holioo ID as a QR code, scanning one and add-links.
const sharesSeenKey=()=>`holioo-shares-seen:${currentUser?.id||''}`;
function sharesSeenAt(){try{return localStorage.getItem(sharesSeenKey())||'1970-01-01T00:00:00Z'}catch{return'1970-01-01T00:00:00Z'}}
function markSharesSeen(){try{localStorage.setItem(sharesSeenKey(),new Date().toISOString())}catch{}}
async function countUnreadShares(){
  if(!peopleReady())return 0;
  const{count,error}=await sb.from('shares').select('id',{count:'exact',head:true}).eq('recipient_id',currentUser.id).gt('created_at',sharesSeenAt());
  return error?0:(count||0);
}
async function refreshSharesBadge(){
  const btn=byId('holiooSharesBtn');if(!btn)return;
  let n=0;try{n=await countUnreadShares()}catch{}
  if(!btn.isConnected)return;
  btn.querySelector('.hs-badge')?.remove();
  if(n>0){btn.insertAdjacentHTML('beforeend',`<i class="hs-badge" aria-hidden="true">${n>9?'9+':n}</i>`);btn.setAttribute('aria-label',`Holioo Shares, ${n} nouveau${n>1?'x':''}`)}
  else btn.setAttribute('aria-label','Holioo Shares');
}

// ---------- my QR code → opens the Add sheet on the other phone ----------
const holiooAddLink=id=>`${location.origin}${location.pathname}#add=${encodeURIComponent(id)}`;
function qrSvg(text){
  const q=window.HolioQR.matrix(text),n=q.size,m=2; // 2-module quiet zone is enough on a white tile
  let d='';for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(q.data[y*n+x])d+=`M${x+m} ${y+m}h1v1h-1z`;
  return`<svg class="ppl-qr" viewBox="0 0 ${n+2*m} ${n+2*m}" role="img" aria-label="QR code de votre identifiant Holioo" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
}
function openMyQrSheet(){
  const id=state.profile.holiooId;
  if(!id){showToast('Identifiant indisponible');return}
  openSheet({title:'Mon code Holioo',subtitle:'Faites-le scanner avec l’appareil photo : l’ajout s’ouvre directement.',
    body:`<div class="ppl-qr-wrap">${qrSvg(holiooAddLink(id))}<p class="ppl-qr-id">@${esc(id)}</p><button class="action-btn ghost" type="button" id="pplQrCopy">${icon('copy',{size:18})}<span>Copier l’identifiant</span></button></div>`,confirmText:'Fermer',secondaryText:'',onConfirm:()=>true});
  byId('pplQrCopy')?.addEventListener('click',()=>copyHoliooId(id));
}

// ---------- scan someone's QR code → find them → add as a friend (two-way, instant) ----------
const QR_SCAN_JSQR='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
let qrLibPromise=null;
function loadJsQR(){
  if(window.jsQR)return Promise.resolve(window.jsQR);
  return qrLibPromise||(qrLibPromise=new Promise((ok,no)=>{const t=document.createElement('script');t.src=QR_SCAN_JSQR;t.onload=()=>ok(window.jsQR);t.onerror=()=>{qrLibPromise=null;no(new Error('jsqr'))};document.head.append(t)}));
}
// A scanned text is my QR link (#add=<id>) or a bare Holioo ID; anything else is ignored.
function holiooIdFromScan(text){
  const t=String(text||'').trim();
  try{const id=new URLSearchParams(new URL(t).hash.slice(1)).get('add');if(id&&/^[a-z0-9]{4,40}$/i.test(id))return id.toLowerCase()}catch{}
  const m=t.replace(/^@/,'');return/^[a-z0-9]{4,40}$/i.test(m)?m.toLowerCase():null;
}
function openQrScanSheet(after=()=>{}){
  if(guestMode||!currentUser){showToast('Connectez-vous avec Google pour ajouter des amis');return}
  if(!needOnline())return;
  if(!navigator.mediaDevices?.getUserMedia){showToast('Caméra indisponible ici');return}
  let stream=null,stopped=false,busy=false;
  const stop=()=>{stopped=true;stream?.getTracks().forEach(t=>t.stop());stream=null};
  openSheet({title:'Scanner un code QR',subtitle:'Visez le code QR Holioo d’un ami : il est ajouté tout de suite.',
    body:`<div class="ppl-scan"><video id="pplScanVideo" playsinline muted autoplay></video></div><p class="ppl-note" id="pplScanMsg" aria-live="polite">Démarrage de la caméra…</p>`,
    confirmText:'Fermer',secondaryText:'',onConfirm:()=>{stop();return true}});
  // Closing the sheet any other way (backdrop tap) also ends the camera.
  const watch=setInterval(()=>{if(!byId('pplScanVideo')){clearInterval(watch);stop()}},400);
  const msg=t=>{const m=byId('pplScanMsg');if(m)m.textContent=t};
  (async()=>{
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      const v=byId('pplScanVideo');if(stopped||!v){stop();return}
      v.srcObject=stream;await v.play().catch(()=>{});msg('Cherchez le code QR…');
      const det=window.BarcodeDetector?new BarcodeDetector({formats:['qr_code']}):null;
      const jsqr=det?null:await loadJsQR();
      const cv=document.createElement('canvas'),cx=cv.getContext('2d',{willReadFrequently:true});
      while(!stopped&&byId('pplScanVideo')){
        await new Promise(r=>setTimeout(r,200));
        if(busy||!v.videoWidth)continue;
        let text=null;
        if(det){try{text=(await det.detect(v))[0]?.rawValue||null}catch{}}
        else{const k=Math.min(1,640/v.videoWidth);cv.width=Math.round(v.videoWidth*k);cv.height=Math.round(v.videoHeight*k);cx.drawImage(v,0,0,cv.width,cv.height);text=jsqr(cx.getImageData(0,0,cv.width,cv.height).data,cv.width,cv.height)?.data||null}
        if(!text)continue;
        const id=holiooIdFromScan(text);
        if(!id){msg('Ce code n’est pas un code Holioo.');continue}
        busy=true;msg('Code lu, recherche…');
        try{
          const p=await findPerson(id);
          if(!p){msg('Personne introuvable.');busy=false;await new Promise(r=>setTimeout(r,1500));continue}
          if(p.uid===currentUser.id){msg('C’est votre propre code.');busy=false;await new Promise(r=>setTimeout(r,1500));continue}
          await addPerson(p.uid);
          stop();closeSheet();showToast(`${personName(p)} ajouté(e) comme ami`);after();return;
        }catch(e){console.error(e);msg(peopleErrorText(e));busy=false;await new Promise(r=>setTimeout(r,2000))}
      }
    }catch(e){console.error(e);stop();msg(e?.name==='NotAllowedError'?'Autorisez la caméra pour scanner.':'Impossible de lancer la caméra.')}
  })();
}
// A scanned link (#add=<id>) is kept until the user is signed in (the Google round trip drops the address), then opens the Add sheet.
const PENDING_ADD_KEY='holioo-pending-add';
function captureAddLink(){
  try{
    const id=new URLSearchParams(location.hash.slice(1)).get('add');
    if(!id||!/^[a-z0-9]{4,40}$/i.test(id))return;
    sessionStorage.setItem(PENDING_ADD_KEY,id);
    const rest=new URLSearchParams(location.hash.slice(1));rest.delete('add');
    history.replaceState(null,'',location.pathname+location.search+(rest.toString()?`#${rest}`:''));
  }catch{}
}
function consumePendingAdd(){
  let id=null;try{id=sessionStorage.getItem(PENDING_ADD_KEY)}catch{}
  if(!id||!currentUser||guestMode||sheetRoot.innerHTML)return;
  try{sessionStorage.removeItem(PENDING_ADD_KEY)}catch{}
  openPeopleSearchSheet(()=>{if(currentView==='people')render()},{prefill:id,autoSearch:true});
}
captureAddLink();
