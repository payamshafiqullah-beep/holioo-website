'use strict';
// Lecture rapide, the data side (pure, no DOM, no globals — tested in tests/reading-logic.test.mjs):
// the tree  courses → sections → sessions → PDFs  that the radial menu shows, built from the courses and the PDF list.
//
// A PDF belongs to the sessions it was made from (`sessionIds`); one made from several sessions appears under each.
// A PDF with no session left (imported file, deleted session) goes to `loose` (shown as "Autres").
// Only what has a PDF is listed. Courses and sessions are newest first (by their latest PDF); sections keep their usual
// order (CM, TD, TP…) so the gesture is the same from one day to the next, as in Capture rapide.

const READING_MAX_PDFS=6;   // most PDFs shown in the last ring (the rest: "•••")

const readingTime=f=>{const t=Date.parse(f?.createdAt);return Number.isFinite(t)?t:0};
const readingNewest=(a,b)=>readingTime(b)-readingTime(a);

// → {courses:[{course, latest, sections:[{section, latest, sessions:[{section, session, latest, pdfs:[file]}]}]}], loose:[file], count}
function readingTree(courses,files){
  const where=new Map();   // session id → {course, section, session}
  for(const course of courses||[])for(const section of course.sections||[])for(const session of section.sessions||[])where.set(session.id,{course,section,session});
  const sorted=[...(files||[])].sort(readingNewest),bySession=new Map(),loose=[];
  for(const f of sorted){
    const hits=[...new Set(f.sessionIds||[])].filter(id=>where.has(id));
    if(!hits.length){loose.push(f);continue}
    for(const id of hits){if(!bySession.has(id))bySession.set(id,[]);bySession.get(id).push(f)}
  }
  const out=[];
  (courses||[]).forEach((course,ci)=>{
    const sections=[];
    for(const section of course.sections||[]){
      const sessions=(section.sessions||[]).filter(s=>bySession.has(s.id)).map(session=>{const pdfs=bySession.get(session.id);return{section,session,latest:readingTime(pdfs[0]),pdfs}});
      sessions.sort((a,b)=>b.latest-a.latest);
      if(sessions.length)sections.push({section,latest:sessions[0].latest,sessions});
    }
    if(sections.length)out.push({course,ci,latest:Math.max(...sections.map(s=>s.latest)),sections});
  });
  out.sort((a,b)=>b.latest-a.latest||a.ci-b.ci);
  return{courses:out,loose,count:(files||[]).length};
}

if(typeof module!=='undefined')module.exports={readingTree,READING_MAX_PDFS};
