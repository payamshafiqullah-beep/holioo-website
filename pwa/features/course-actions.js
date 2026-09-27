'use strict';

async function fillSessionThumbs(session){
  const box=document.getElementById('sessionThumbs');if(!box)return;box.innerHTML='';
  const ctx=findSessionContext(session.id);
  for(let i=0;i<session.photoIds.length;i++){
    const id=session.photoIds[i],row=await DB.get('photos',id);if(!row?.blob)continue;const url=URL.createObjectURL(row.blob),status=photoStatusLabel(row),d=document.createElement('div');d.className='thumb gallery-thumb';
    d.innerHTML=`<img src="${url}" alt="Photo ${i+1}" data-open-photo="${i}"><span class="num">${i+1}</span><span class="thumb-status badge ${status.cls}">${status.label}</span><div class="thumb-actions"><button data-left="${id}" aria-label="Déplacer à gauche">←</button><button data-right="${id}" aria-label="Déplacer à droite">→</button><button data-move="${id}" aria-label="Déplacer vers une autre séance">↗</button><button data-del="${id}" aria-label="Supprimer">×</button></div>`;
    d.querySelector('[data-open-photo]').onclick=()=>openPhotoViewer(session.photoIds,i,{title:session.title,source:'session',sourceId:session.id,editable:true,returnView:'session',courseId:ctx?.course.id,currentSectionId:ctx?.section.id,sectionId:ctx?.section.id,sessionId:session.id});
    box.appendChild(d);
  }
  box.querySelectorAll('[data-left]').forEach(b=>b.onclick=e=>{e.stopPropagation();movePhoto(session,b.dataset.left,-1)});
  box.querySelectorAll('[data-right]').forEach(b=>b.onclick=e=>{e.stopPropagation();movePhoto(session,b.dataset.right,1)});
  box.querySelectorAll('[data-move]').forEach(b=>b.onclick=e=>{e.stopPropagation();movePhotoToSession(session,b.dataset.move)});
  box.querySelectorAll('[data-del]').forEach(b=>b.onclick=e=>{e.stopPropagation();deleteSessionPhoto(session,b.dataset.del)});
}

function movePhotoToSession(sourceSession,photoId){
  const targets=[];for(const course of state.courses)for(const section of course.sections)for(const session of section.sessions)if(session.id!==sourceSession.id)targets.push({course,section,session});
  if(!targets.length){showToast('Créez d’abord une autre séance');return}
  openSheet({title:'Déplacer la photo',subtitle:'Choisissez la séance de destination.',body:`<div class="field"><label>Destination</label><select id="moveTarget">${targets.map(t=>`<option value="${t.session.id}">${esc(t.course.name)} • ${esc(t.section.name)} • ${esc(t.session.title)}</option>`).join('')}</select></div>`,confirmText:'Déplacer',confirmClass:'purple',onConfirm:()=>{const id=byId('moveTarget').value,target=targets.find(t=>t.session.id===id);if(!target)return false;sourceSession.photoIds=sourceSession.photoIds.filter(x=>x!==photoId);target.session.photoIds.push(photoId);saveState();queueSync();render();showToast('Photo déplacée');return true}})
}

function movePhoto(session,id,dir){const i=session.photoIds.indexOf(id),j=i+dir;if(i<0||j<0||j>=session.photoIds.length)return;[session.photoIds[i],session.photoIds[j]]=[session.photoIds[j],session.photoIds[i]];saveState();render();queueSync()}

async function deleteSessionPhoto(session,id){openSheet({title:'Supprimer la photo ?',subtitle:'Elle sera supprimée de Holioo sur cet appareil. Une copie déjà synchronisée dans Drive peut rester jusqu’à suppression manuelle.',confirmText:'Supprimer',confirmClass:'coral',onConfirm:async()=>{session.photoIds=session.photoIds.filter(x=>x!==id);await DB.del('photos',id);saveState();render();return true}})}