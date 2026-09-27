'use strict';

async function startCamera(){stopCamera();const video=document.getElementById('cameraVideo');if(!video)return;try{cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:cameraFacing},width:{ideal:1920},height:{ideal:1080}},audio:false});video.srcObject=cameraStream;cameraTrack=cameraStream.getVideoTracks()[0];const caps=cameraTrack.getCapabilities?.()||{},zr=document.getElementById('zoomRange'),tb=document.getElementById('torchBtn');if(caps.zoom&&zr){zr.min=caps.zoom.min;zr.max=caps.zoom.max;zr.step=caps.zoom.step||.1;zr.value=Math.max(caps.zoom.min,Math.min(1,caps.zoom.max));zoomValue=Number(zr.value);byId('zoomLabel').textContent=`${zoomValue.toFixed(1)}×`}else if(zr){zr.disabled=true;byId('zoomLabel').textContent='Non dispo'}if(tb&&!caps.torch){tb.disabled=true;tb.textContent='Torche indisponible'}}catch(e){console.error(e);showToast('Autorisez la caméra dans Safari') }}

function stopCamera(){cameraStream?.getTracks?.().forEach(t=>t.stop());cameraStream=null;cameraTrack=null;torchOn=false}

async function applyZoom(e){if(!cameraTrack)return;zoomValue=Number(e.target.value);try{await cameraTrack.applyConstraints({advanced:[{zoom:zoomValue}]});byId('zoomLabel').textContent=`${zoomValue.toFixed(1)}×`}catch{}}

async function toggleTorch(){if(!cameraTrack)return;const caps=cameraTrack.getCapabilities?.()||{};if(!caps.torch){showToast('La torche n’est pas disponible dans ce navigateur');return}torchOn=!torchOn;try{await cameraTrack.applyConstraints({advanced:[{torch:torchOn}]});byId('torchBtn').classList.toggle('active',torchOn)}catch{showToast('Impossible d’activer la torche')}}

async function capturePhoto(){const video=document.getElementById('cameraVideo');if(!video?.videoWidth){showToast('La caméra n’est pas prête');return}const maxW=1800,scale=Math.min(1,maxW/video.videoWidth),c=document.createElement('canvas');c.width=Math.round(video.videoWidth*scale);c.height=Math.round(video.videoHeight*scale);c.getContext('2d').drawImage(video,0,0,c.width,c.height);const blob=await new Promise(res=>c.toBlob(res,'image/jpeg',.9));const id=uid();await DB.put('photos',{id,blob,createdAt:now(),syncState:'pending'});captureIds.push(id);state.captureDraft.photoIds=[...captureIds];saveState();byId('captureCount').textContent=`${captureIds.length} photo${captureIds.length>1?'s':''}`;navigator.vibrate?.(18)}

async function importGallery(e){for(const f of [...(e.target.files||[])]){const id=uid();await DB.put('photos',{id,blob:f,createdAt:now(),syncState:'pending'});captureIds.push(id)}state.captureDraft.photoIds=[...captureIds];saveState();byId('captureCount').textContent=`${captureIds.length} photo${captureIds.length>1?'s':''}`;e.target.value=''}

function finishCapture(){if(!captureIds.length){showToast('Prenez au moins une photo');return}stopCamera();currentBatch={id:state.captureDraft?.id||uid(),photoIds:[...captureIds],selected:new Set(captureIds),createdAt:state.captureDraft?.createdAt||now(),splitQueue:[]};state.captureDraft=null;captureIds=[];saveState();navigate('captureComplete')}

async function fillThumbs(containerId,ids,{selectable=false,split=false,viewerTitle='Galerie'}={}){
  const box=document.getElementById(containerId);if(!box)return;box.innerHTML='';
  for(let i=0;i<ids.length;i++){
    const id=ids[i],row=await DB.get('photos',id);if(!row?.blob)continue;const url=URL.createObjectURL(row.blob),selected=currentBatch?.selected?.has(id),status=photoStatusLabel(row),b=document.createElement('button');
    b.className=`thumb ${selectable&&selected?'selected':''} ${split?(selected?'group-a':'group-b'):''}`;
    b.innerHTML=`<img src="${url}" alt="Photo ${i+1}"><span class="num">${i+1}</span>${!selectable?`<span class="thumb-status badge ${status.cls}">${status.label}</span>`:''}${selectable&&!split?`<span class="check">${selected?'✓':''}</span>`:''}${split?`<span class="group-tag">${selected?'LOT 1':'LOT 2'}</span>`:''}`;
    if(selectable)b.onclick=()=>{selected?currentBatch.selected.delete(id):currentBatch.selected.add(id);render()};
    else b.onclick=()=>openPhotoViewer(ids,i,{title:viewerTitle,source:'batch',sourceId:currentBatch?.id||null,editable:false,returnView:currentView,courseId:currentCourseId,sectionId:currentSectionId,sessionId:currentSessionId});
    box.appendChild(b);
  }
}

function saveBatchToInbox(batch){state.inbox.unshift({id:batch.id,title:`Capture ${fmtShort(batch.createdAt)}`,photoIds:[...batch.photoIds],createdAt:batch.createdAt});saveState();currentBatch=null;showToast('Lot enregistré dans Inbox');queueSync();navigate('home')}

function assignCurrentBatch(customTitle){const c=getCourse(),s=getSection(c);if(!c||!s)return;const num=(s.sessions.at(-1)?.number||0)+1,q={id:uid(),number:num,title:customTitle.trim()||`${s.name} ${num}`,photoIds:[...currentBatch.photoIds],createdAt:now(),visibility:'private'};s.sessions.push(q);currentSessionId=q.id;const nextBatch=currentBatch.splitQueue?.shift()||null;saveState();queueSync();if(nextBatch){currentBatch=nextBatch;currentCourseId=null;currentSectionId=null;showToast('Lot 1 enregistré. Organisez maintenant le lot suivant.');navigate('organize')}else{currentBatch=null;navigate('session')}}