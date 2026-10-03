'use strict';
// Course navigator (tablet / computer, ui/course-navigator.js): the one tree every desk screen shares —
// courses, and under an open course its sessions grouped by CM / TD / TP (and custom sections).
// Pure functions, no DOM and no globals, so they can be tested with Node: tests/navigator.test.mjs.
//
// The selection is three ids (currentCourseId / currentSectionId / currentSessionId): a course, a type of that
// course, or a session — the deepest one set is what is "selected" (highlighted, in the breadcrumb, used by the
// Galerie, the Notes page, the PDF builder and the camera).

// Strip accents and case so "séance" is found by "seance".
const navNorm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();

// "Search filters courses": by name; an empty search keeps everything.
function navFilterCourses(courses,query){
  const q=navNorm(query);
  return(courses||[]).filter(c=>!c.done&&(!q||navNorm(c.name).includes(q)));
}

// What the ids point at, checked against the data. The session knows its section and course (a session left over
// from another course than the one asked for is ignored); a section its course; anything unknown is dropped (null),
// never a half-valid mix.
function navResolve(courses,ids){
  const{courseId,sectionId,sessionId}=ids||{};
  if(sessionId)for(const course of courses||[])for(const section of course.sections||[])for(const session of section.sessions||[])
    if(session.id===sessionId&&(!courseId||course.id===courseId))return{course,section,session,kind:'session'};
  const course=(courses||[]).find(c=>c.id===courseId)||null;
  const section=course&&sectionId?(course.sections||[]).find(s=>s.id===sectionId)||null:null;
  return{course,section,session:null,kind:section?'section':course?'course':null};
}

// The ids that go with a choice: choosing a course clears the type and session, a type clears the session.
function navIds(kind,{courseId=null,sectionId=null,sessionId=null}={}){
  if(kind==='course')return{courseId,sectionId:null,sessionId:null};
  if(kind==='section')return{courseId,sectionId,sessionId:null};
  return{courseId,sectionId,sessionId};
}

// Breadcrumb: course › type › session, each part with what choosing it selects.
function navBreadcrumb(courses,ids){
  const r=navResolve(courses,ids),out=[];
  if(r.course)out.push({kind:'course',label:r.course.name,ids:navIds('course',{courseId:r.course.id})});
  if(r.section)out.push({kind:'section',label:r.section.name,ids:navIds('section',{courseId:r.course.id,sectionId:r.section.id})});
  if(r.session)out.push({kind:'session',label:r.session.title,ids:navIds('session',{courseId:r.course.id,sectionId:r.section.id,sessionId:r.session.id})});
  return out;
}

// Which screen shows a choice. Screens that depend on the course / type / session (Galerie, Notes, Séance, PDF)
// stay where they are and follow the selection; any other screen goes to the one that fits: a course or a type
// opens the Galerie, a session opens the séance. The séance screen and the PDF builder need a session, so they
// cannot follow a course or a type alone (the PDF builder picks one, see navPickSession).
const NAV_FOLLOWS={course:['gallery','notes','pdfBuilder'],section:['gallery','notes','pdfBuilder'],session:['gallery','notes','pdfBuilder','session']};
function navTargetView(view,kind){
  if((NAV_FOLLOWS[kind]||[]).includes(view))return view;
  return kind==='session'?'session':'gallery';
}

// A session for the screens that need one when only a course or a type is chosen: today's if there is one,
// else the latest (with `photos`, the latest that holds photos). Within the type when one is given.
const navSameDay=(a,b)=>{const x=new Date(a),y=new Date(b);return!isNaN(x)&&!isNaN(y)&&x.getFullYear()===y.getFullYear()&&x.getMonth()===y.getMonth()&&x.getDate()===y.getDate()};
function navPickSession(course,section=null,{photos=false,date=new Date()}={}){
  const sections=section?[section]:course?.sections||[];
  const pairs=sections.flatMap(s=>(s.sessions||[]).map(q=>({section:s,session:q})));
  const byDate=(a,b)=>String(b.session.createdAt||'').localeCompare(String(a.session.createdAt||''));
  const pool=photos&&pairs.some(x=>(x.session.photoIds||[]).length)?pairs.filter(x=>(x.session.photoIds||[]).length):pairs;
  const today=pool.filter(x=>navSameDay(x.session.createdAt,date)).sort(byDate)[0];
  return today||[...pool].sort(byDate)[0]||null;
}

// The next new session of a type: its number and its automatic title ("TD 3").
function navNewSession(section){
  const number=(section?.sessions?.at(-1)?.number||0)+1;
  return{number,title:`${section?.name||''} ${number}`.trim()};
}

// Courses unfold one by one: the open ones are kept in a Set of ids. Choosing a course selects it and opens it;
// choosing the one already selected (and not a type or session below it) folds / unfolds it.
function navCourseTap(open,selection,courseId){
  const here=selection?.kind==='course'&&selection.course?.id===courseId;
  if(here){open.has(courseId)?open.delete(courseId):open.add(courseId);return{select:false,open:open.has(courseId)}}
  open.add(courseId);return{select:true,open:true};
}

if(typeof module!=='undefined')module.exports={navNorm,navFilterCourses,navResolve,navIds,navBreadcrumb,navTargetView,navPickSession,navNewSession,navCourseTap,navSameDay};
