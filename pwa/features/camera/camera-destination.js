'use strict';
// Camera destination: which course → section → session the next photo goes to.
// Pure logic (no DOM, no globals) so it can be tested with Node: see tests/camera-destination.test.mjs.
//
// Timetable entry: {id, courseId, sectionId, day, start, end}
//   day   0–6 like Date#getDay (0 = dimanche)
//   start/end 'HH:MM', local time
// Destination: {courseId, sectionId, sessionId}  (sessionId null = a new session, created on the first photo)

const CAMERA_TIMETABLE_TOLERANCE={before:10,after:10}; // minutes around a class that still count as "in class"

const camMinutes=hhmm=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(hhmm||''));return m?Number(m[1])*60+Number(m[2]):NaN};

// The timetable entry for this moment, or null.
// Several matches (back-to-back or overlapping classes): the one that started most recently wins;
// when none has started yet (we are in the tolerance before a class), the one starting first.
function matchTimetable(entries,date=new Date(),tol=CAMERA_TIMETABLE_TOLERANCE){
  const day=date.getDay(),t=date.getHours()*60+date.getMinutes();
  const hits=[];
  for(const e of entries||[]){
    const s=camMinutes(e?.start),en=camMinutes(e?.end);
    if(Number(e?.day)!==day||!Number.isFinite(s)||!Number.isFinite(en)||en<=s)continue;
    if(t>=s-tol.before&&t<=en+tol.after)hits.push({e,s});
  }
  if(!hits.length)return null;
  const started=hits.filter(h=>h.s<=t);
  if(started.length)return started.reduce((a,b)=>b.s>a.s?b:a).e;
  return hits.reduce((a,b)=>b.s<a.s?b:a).e;
}

const sameLocalDay=(iso,date)=>{const d=new Date(iso);return !isNaN(d)&&d.getFullYear()===date.getFullYear()&&d.getMonth()===date.getMonth()&&d.getDate()===date.getDate()};

function findCourseSection(courses,courseId,sectionId){
  const course=(courses||[]).find(c=>c.id===courseId);
  const section=course?.sections?.find(s=>s.id===sectionId);
  return course&&section?{course,section}:null;
}

// The section's session started today (the latest one), or null.
const todaySession=(section,date=new Date())=>[...(section?.sessions||[])].reverse().find(s=>sameLocalDay(s.createdAt,date))||null;

// Next photo's destination, in this order: timetable → last used → none (the user must choose).
// Returns {courseId, sectionId, sessionId, source:'timetable'|'last'} or null.
function resolveCameraDestination({courses,timetable,last},date=new Date()){
  const hit=matchTimetable(timetable,date);
  const cs=hit&&findCourseSection(courses,hit.courseId,hit.sectionId);
  if(cs){
    // Same class, same day: keep adding to the session started today instead of opening a new one.
    return{courseId:cs.course.id,sectionId:cs.section.id,sessionId:todaySession(cs.section,date)?.id||null,source:'timetable'};
  }
  const lc=last&&findCourseSection(courses,last.courseId,last.sectionId);
  if(lc){
    const session=last.sessionId&&lc.section.sessions?.find(s=>s.id===last.sessionId);
    return{courseId:lc.course.id,sectionId:lc.section.id,sessionId:session?.id||null,source:'last'};
  }
  return null;
}

// Number of the next session in a section (same rule as the rest of the app).
const nextSessionNumber=section=>(section?.sessions?.at(-1)?.number||0)+1;

// Recent destinations, newest first, without duplicates and without deleted places.
function pushRecentDestination(recent,dest,max=5){
  const key=d=>`${d.courseId}|${d.sectionId}|${d.sessionId||''}`;
  const clean={courseId:dest.courseId,sectionId:dest.sectionId,sessionId:dest.sessionId||null};
  // Once a new session exists, the "new session in this section" entry it came from is dropped.
  const stale=d=>key(d)===key(clean)||(clean.sessionId&&!d.sessionId&&d.courseId===clean.courseId&&d.sectionId===clean.sectionId);
  return[clean,...(recent||[]).filter(d=>!stale(d))].slice(0,max);
}
function validRecentDestinations(recent,courses){
  return(recent||[]).filter(d=>{
    const cs=findCourseSection(courses,d.courseId,d.sectionId);
    return cs&&(!d.sessionId||cs.section.sessions?.some(s=>s.id===d.sessionId));
  });
}

// Quick Capture (Accueil): the courses of the first ring, the last used first, then the others in
// their usual order. At most `max` items: when there are more courses, the last slot is left for "Plus…".
function quickCaptureCourses(courses,recent,last,max=7){
  const list=[],seen=new Set();
  const add=id=>{const c=(courses||[]).find(x=>x.id===id);if(c&&!seen.has(c.id)){seen.add(c.id);list.push(c)}};
  if(last)add(last.courseId);
  for(const d of recent||[])add(d.courseId);
  for(const c of courses||[])add(c.id);
  return list.length<=max?{courses:list,more:false}:{courses:list.slice(0,Math.max(1,max-1)),more:true};
}

// The section of this course used last with the camera (marked in the second ring), or null.
function quickCaptureLastSection(courseId,recent,last){
  if(last?.courseId===courseId)return last.sectionId;
  return(recent||[]).find(d=>d.courseId===courseId)?.sectionId||null;
}

// Where a Quick Capture photo goes: today's session of that section, or a new one (created with
// today's date on the first photo, like everywhere else in the camera).
function quickCaptureDestination(course,section,date=new Date()){
  return{courseId:course.id,sectionId:section.id,sessionId:todaySession(section,date)?.id||null,source:'quick'};
}

// Where "Reprendre" (Accueil) goes: the camera's last destination — what its chip showed last (state.cameraLast, kept whenever the
// destination changes and whenever a photo is shot), else the séance of the last photo (state.cameraShot). {course, section, session}
// with session null when that séance is still to be created (it is made with the first photo). null when neither exists any more.
function lastCameraTarget(courses,last,shot){
  const cs=last&&findCourseSection(courses,last.courseId,last.sectionId);
  if(cs)return{course:cs.course,section:cs.section,session:(last.sessionId&&cs.section.sessions?.find(s=>s.id===last.sessionId))||null};
  if(shot?.sessionId)for(const course of courses||[])for(const section of course.sections||[]){
    const session=section.sessions?.find(s=>s.id===shot.sessionId);if(session)return{course,section,session};
  }
  return null;
}

if(typeof module!=='undefined')module.exports={lastCameraTarget,matchTimetable,resolveCameraDestination,nextSessionNumber,pushRecentDestination,validRecentDestinations,camMinutes,todaySession,quickCaptureCourses,quickCaptureLastSection,quickCaptureDestination};
