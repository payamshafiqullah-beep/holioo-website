'use strict';
// Camera, batches: photo thumbnails and filing a batch in Captures (the inbox).
async function fillThumbs(containerId,ids,{selectable=false,split=false,viewerTitle='Galerie',reorder=false}={}){
  const box=document.getElementById(containerId);if(!box)return;box.innerHTML='';
  for(let i=0;i<ids.length;i++){
    const id=ids[i],row=await photoRow(id);if(!row?.blob)continue;
    const url=await photoThumbUrl(id);if(!url||!box.isConnected)continue;
    const selected=currentBatch?.selected?.has(id),status=photoStatusLabel(row),b=document.createElement('div');
    b.setAttribute('role','button');b.tabIndex=0;b.onkeydown=e=>{if(e.target===b&&(e.key==='Enter'||e.key===' ')){e.preventDefault();b.click()}};
    b.className=`thumb ${selectable&&selected?'selected':''} ${split?(selected?'group-a':'group-b'):''}`;b.dataset.photoId=id;
    b.innerHTML=`<img src="${url}" alt="Photo ${i+1}" draggable="false" decoding="async"><span class="num">${i+1}</span>${!selectable?`<span class="thumb-status badge ${status.cls}">${status.label}</span>`:''}${selectable&&!split?`<span class="check">${selected?'✓':''}</span>`:''}${split?`<span class="group-tag">${selected?'LOT 1':'LOT 2'}</span>`:''}`;
    if(selectable)b.onclick=()=>{selected?currentBatch.selected.delete(id):currentBatch.selected.add(id);render()};
    else b.onclick=()=>openPhotoViewer(ids,Math.max(0,ids.indexOf(id)),{title:viewerTitle,source:'batch',sourceId:currentBatch?.id||null,editable:!selectable,returnView:currentView,courseId:currentCourseId,sectionId:currentSectionId,sessionId:currentSessionId});
    if(!selectable)attachItemMenu(b,photoMenu(id),{press:!reorder});
    box.appendChild(b);
  }
  // `ids` is the batch's own array: reorder it in place so everything that uses the batch follows.
  if(reorder)makeReorderable(box,{...(selectable?{}:{onHandle:itemMenuFromHandle}),onChange:order=>{const rest=ids.filter(x=>!order.includes(x));ids.splice(0,ids.length,...order,...rest);const saved=state.inbox.find(b=>b.id===currentBatch?.id);if(saved)saved.photoIds=[...ids];saveState();queueSync();showToast('Ordre enregistré')}});
}

// Photos leave Captures only once they are filed in a session: a batch opened from Captures
// stays there until then, so leaving the screen or closing the app never loses it.
function removeFromInbox(ids){
  const gone=new Set(ids);
  for(const b of state.inbox)b.photoIds=(b.photoIds||[]).filter(id=>!gone.has(id));
  state.inbox=state.inbox.filter(b=>b.photoIds.length);
}

function saveBatchToInbox(batch){
  removeFromInbox(batch.photoIds);
  state.inbox.unshift({id:batch.id,title:batch.title||`Capture ${fmtShort(batch.createdAt)}`,photoIds:[...batch.photoIds],createdAt:batch.createdAt});
  saveState();currentBatch=null;showToast('Lot gardé dans Captures');queueSync();navigate('home');
}

function assignCurrentBatch(customTitle){
  const c=getCourse(),s=getSection(c);if(!c||!s)return;
  const num=(s.sessions.at(-1)?.number||0)+1;
  const q={id:uid(),number:num,title:customTitle.trim()||`${s.name} ${num}`,photoIds:[...currentBatch.photoIds],createdAt:now(),visibility:'private'};
  s.sessions.push(q);currentSessionId=q.id;removeFromInbox(q.photoIds);
  const nextBatch=currentBatch.splitQueue?.shift()||null;
  saveState();queueSync();
  if(nextBatch){
    currentBatch=nextBatch;currentCourseId=null;currentSectionId=null;
    showToast('Lot 1 enregistré. Organisez maintenant le lot suivant.');
    navigate('organize');
  }else{
    currentBatch=null;navigate('session');
  }
}
