'use strict';

async function fillSessionThumbs(session){
  const box=document.getElementById('sessionThumbs');if(!box)return;box.innerHTML='';
  const ctx=findSessionContext(session.id);
  for(let i=0;i<session.photoIds.length;i++){
    const id=session.photoIds[i],row=await DB.get('photos',id);if(!row?.blob)continue;const url=await photoThumbUrl(id);if(!url||!box.isConnected)continue;const status=photoStatusLabel(row),d=document.createElement('div');d.className='thumb gallery-thumb';d.dataset.photoId=id;
    d.innerHTML=`<img src="${url}" alt="Photo ${i+1}" draggable="false" decoding="async"><span class="num">${i+1}</span><span class="thumb-status badge ${status.cls}">${status.label}</span>`;
    d.onclick=()=>openPhotoViewer(session.photoIds,Math.max(0,session.photoIds.indexOf(id)),{title:session.title,source:'session',sourceId:session.id,editable:true,returnView:'session',courseId:ctx?.course.id,currentSectionId:ctx?.section.id,sectionId:ctx?.section.id,sessionId:session.id});
    attachItemMenu(d,photoMenu(id));
    box.appendChild(d);
  }
  box.querySelectorAll('[data-move]').forEach(b=>b.onclick=e=>{e.stopPropagation();movePhotoToSession(session,b.dataset.move)});
  // Photos missing on this device keep their place at the end of the order.
  makeReorderable(box,{holdMs:6e5,onChange:ids=>{session.photoIds=[...ids,...session.photoIds.filter(x=>!ids.includes(x))];saveState();queueSync();showToast('Ordre enregistré')}});
}

function movePhotoToSession(sourceSession,photoId){
  const targets=[];for(const course of state.courses)for(const section of course.sections)for(const session of section.sessions)if(session.id!==sourceSession.id)targets.push({course,section,session});
  if(!targets.length){showToast('Créez d’abord une autre séance');return}
  openSheet({title:'Déplacer la photo',subtitle:'Choisissez la séance de destination.',body:`<div class="field"><label>Destination</label><select id="moveTarget">${targets.map(t=>`<option value="${t.session.id}">${esc(t.course.name)} • ${esc(t.section.name)} • ${esc(t.session.title)}</option>`).join('')}</select></div>`,confirmText:'Déplacer',confirmClass:'purple',onConfirm:()=>{const id=byId('moveTarget').value,target=targets.find(t=>t.session.id===id);if(!target)return false;sourceSession.photoIds=sourceSession.photoIds.filter(x=>x!==photoId);target.session.photoIds.push(photoId);saveState();queueSync();render();showToast('Photo déplacée');return true}})
}

// Course, section and séance names are Drive folder names too: two with the same name would share one folder.
const sameName=(a,b)=>a.trim().toLowerCase()===b.trim().toLowerCase();
function courseNameProblem(name,except=null){
  if(!name)return'Entrez un nom de cours';
  return state.courses.some(c=>c.id!==except&&sameName(c.name,name))?'Un cours porte déjà ce nom':'';
}
function sectionNameProblem(course,name,except=null){
  if(!name)return'Entrez un nom de section';
  return course.sections.some(s=>s.id!==except&&sameName(s.name,name))?'Une section porte déjà ce nom dans ce cours':'';
}
function sessionTitleProblem(section,title,except=null){
  if(!title)return'Entrez un titre';
  return section.sessions.some(q=>q.id!==except&&sameName(q.title,title))?'Une séance porte déjà ce titre dans cette section':'';
}
