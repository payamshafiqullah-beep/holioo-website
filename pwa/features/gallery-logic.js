'use strict';
// Galerie (tablet / computer, pages/GalleryDeskPage.js): the photos of one course, filtered by section type.
// Pure functions, no DOM and no globals, so they can be tested with Node: tests/gallery.test.mjs.
//
// Filter: 'all', a section's id (what the course navigator selects: CM, TD, TP or a custom section), or 'CM' | 'TD' | 'TP'
// — a section matches when its id, its name or its type is that filter. A séance narrows it further (`sessionId`).

const gallerySectionMatches=(section,filter)=>filter==='all'||!filter||section?.id===filter||String(section?.name||'').trim().toUpperCase()===filter||section?.type===filter;

// Every photo of the course in display order: sections in their order, séances in their order, photos in
// the séance's own order. A photo listed twice shows once.
function galleryEntries(course,filter='all',sessionId=null){
  const out=[],seen=new Set();
  for(const section of course?.sections||[]){
    if(!gallerySectionMatches(section,filter))continue;
    for(const session of section.sessions||[]){
      if(sessionId&&session.id!==sessionId)continue;
      (session.photoIds||[]).forEach((id,index)=>{if(seen.has(id))return;seen.add(id);out.push({id,section,session,index})});
    }
  }
  return out;
}

// The course on screen: the one asked for, else the last used with the camera, else the first one still running.
function galleryDefaultCourse(courses,wantedId,lastCourseId){
  const live=(courses||[]).filter(c=>!c.done);
  return live.find(c=>c.id===wantedId)||(courses||[]).find(c=>c.id===wantedId)||live.find(c=>c.id===lastCourseId)||live[0]||(courses||[])[0]||null;
}

// Where the camera sends the next photo: the section of the filter ("CM" → the CM section); with "Tous" the
// section used last with the camera in this course, else the first one.
function galleryCaptureSection(course,filter,lastSectionId=null){
  const sections=course?.sections||[];
  if(filter&&filter!=='all'){const s=sections.find(x=>gallerySectionMatches(x,filter));if(s)return s}
  return sections.find(s=>s.id===lastSectionId)||sections[0]||null;
}

// "Change position": a photo goes to a 0-based place in its list (clamped); the other photos keep their order.
function galleryMoveInList(ids,id,to){
  const list=[...ids],from=list.indexOf(id);
  if(from<0)return list;
  list.splice(from,1);
  list.splice(Math.max(0,Math.min(list.length,to)),0,id);
  return list;
}

if(typeof module!=='undefined')module.exports={gallerySectionMatches,galleryEntries,galleryDefaultCourse,galleryCaptureSection,galleryMoveInList};
