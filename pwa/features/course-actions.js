'use strict';

async function fillSessionThumbs(session){
  const box=document.getElementById('sessionThumbs');if(!box)return;box.innerHTML='';
  const ctx=findSessionContext(session.id);
  for(let i=0;i<session.photoIds.length;i++){
    const id=session.photoIds[i],row=await DB.get('photos',id);if(!row?.blob)continue;const url=await photoThumbUrl(id);if(!url||!box.isConnected)continue;const status=photoStatusLabel(row),d=document.createElement('div');d.className='thumb gallery-thumb';d.dataset.photoId=id;
    d.innerHTML=`<img src="${url}" alt="Photo ${i+1}" draggable="false" decoding="async"><span class="num">${i+1}</span><span class="thumb-status badge ${status.cls}">${status.label}</span><div class="thumb-actions"><button data-del="${id}" aria-label="Supprimer cette photo">${icon('trash',{size:20})}</button></div>`;
    d.onclick=()=>openPhotoViewer(session.photoIds,Math.max(0,session.photoIds.indexOf(id)),{title:session.title,source:'session',sourceId:session.id,editable:true,returnView:'session',courseId:ctx?.course.id,currentSectionId:ctx?.section.id,sectionId:ctx?.section.id,sessionId:session.id});
    box.appendChild(d);
  }
  box.querySelectorAll('[data-move]').forEach(b=>b.onclick=e=>{e.stopPropagation();movePhotoToSession(session,b.dataset.move)});
  box.querySelectorAll('[data-del]').forEach(b=>b.onclick=e=>{e.stopPropagation();deleteSessionPhoto(session,b.dataset.del)});
  // Photos missing on this device keep their place at the end of the order.
  makeReorderable(box,{onChange:ids=>{session.photoIds=[...ids,...session.photoIds.filter(x=>!ids.includes(x))];saveState();queueSync();showToast('Ordre enregistré')}});
}

function movePhotoToSession(sourceSession,photoId){
  const targets=[];for(const course of state.courses)for(const section of course.sections)for(const session of section.sessions)if(session.id!==sourceSession.id)targets.push({course,section,session});
  if(!targets.length){showToast('Créez d’abord une autre séance');return}
  openSheet({title:'Déplacer la photo',subtitle:'Choisissez la séance de destination.',body:`<div class="field"><label>Destination</label><select id="moveTarget">${targets.map(t=>`<option value="${t.session.id}">${esc(t.course.name)} • ${esc(t.section.name)} • ${esc(t.session.title)}</option>`).join('')}</select></div>`,confirmText:'Déplacer',confirmClass:'purple',onConfirm:()=>{const id=byId('moveTarget').value,target=targets.find(t=>t.session.id===id);if(!target)return false;sourceSession.photoIds=sourceSession.photoIds.filter(x=>x!==photoId);target.session.photoIds.push(photoId);saveState();queueSync();render();showToast('Photo déplacée');return true}})
}


function deleteSessionPhoto(session,id){confirmDeletePhoto(id)}

// Sessions that are removed (with their course, their section or alone): their photos that no other
// session or Captures batch uses go back to « Captures à trier », one batch per session, so nothing is lost.
function keepPhotosOfRemovedSessions(course,removed){
  const gone=new Set(removed.map(s=>s.id));
  const assigned=new Set(state.inbox.flatMap(b=>b.photoIds||[]));
  for(const c of state.courses)for(const section of c.sections)for(const session of section.sessions)if(!gone.has(session.id))for(const photoId of session.photoIds||[])assigned.add(photoId);
  for(const session of removed){
    const photoIds=[...new Set(session.photoIds||[])].filter(photoId=>!assigned.has(photoId));
    photoIds.forEach(photoId=>assigned.add(photoId));
    if(photoIds.length)state.inbox.push({id:uid(),title:`${course.name} · ${session.title}`,photoIds,createdAt:session.createdAt||now()});
  }
}

function removeSession(sessionId){
  const ctx=findSessionContext(sessionId);if(!ctx)return;
  keepPhotosOfRemovedSessions(ctx.course,[ctx.session]);
  ctx.section.sessions=ctx.section.sessions.filter(s=>s.id!==sessionId);
  if(currentSessionId===sessionId)currentSessionId=null;
  purgeSessionInk([sessionId]).catch(console.warn);
}

// Only custom sections: CM / TD / TP are part of every course and come back by name (ensureDefaultSections).
function removeSection(course,sectionId){
  const section=course.sections.find(s=>s.id===sectionId);if(!section||section.type!=='CUSTOM')return;
  const sessionIds=section.sessions.map(s=>s.id);
  keepPhotosOfRemovedSessions(course,section.sessions);
  course.sections=course.sections.filter(s=>s.id!==sectionId);
  if(Array.isArray(state.timetable))state.timetable=state.timetable.filter(t=>t.sectionId!==sectionId);
  if(currentSectionId===sectionId){currentSectionId=null;currentSessionId=null}
  purgeSessionInk(sessionIds).catch(console.warn);
}

// Section and course names are Drive folder names too: two with the same name would share one folder.
function sectionNameProblem(course,name,except=null){
  if(!name)return'Entrez un nom de section';
  if(['CM','TD','TP'].includes(name.toUpperCase()))return'CM, TD et TP existent déjà dans chaque cours';
  if(course.sections.some(s=>s.id!==except&&s.name.toLowerCase()===name.toLowerCase()))return'Une section porte déjà ce nom';
  return'';
}
function courseNameProblem(name,except=null){
  if(!name)return'Entrez un nom de cours';
  if(state.courses.some(c=>c.id!==except&&c.name.toLowerCase()===name.toLowerCase()))return'Un cours porte déjà ce nom';
  return'';
}
