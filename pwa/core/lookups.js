'use strict';
// Lookups of the course, section and session on screen.
function bindCourseCards(){document.querySelectorAll('[data-course]').forEach(b=>b.onclick=()=>{currentCourseId=b.dataset.course;navigate('course')})}
function getCourse(id=currentCourseId){return state.courses.find(c=>c.id===id)}
function getSection(course=getCourse(),id=currentSectionId){return course?.sections.find(s=>s.id===id)}
function getSession(section=getSection(),id=currentSessionId){return section?.sessions.find(s=>s.id===id)}
function findSessionContext(sessionId=currentSessionId){for(const course of state.courses)for(const section of course.sections)for(const session of section.sessions)if(session.id===sessionId)return{course,section,session};return null}
