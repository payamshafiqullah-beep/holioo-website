import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The app files are plain browser scripts: load this one (in this realm, so arrays compare strictly) and use its functions.
const mod = { exports: {} };
new Function('module', fs.readFileSync(new URL('../features/courses/navigator-logic.js', import.meta.url), 'utf8'))(mod);
const N = mod.exports;

const ses = (id, title, createdAt, photoIds = [], number) => ({ id, title, createdAt, photoIds, number });
const sec = (id, name, sessions = []) => ({ id, name, type: name, sessions });
const courses = [
  { id: 'c1', name: 'Traitement du signal', sections: [
    sec('cm1', 'CM', [ses('q1', 'CM 1', '2026-09-01T10:00:00', ['a'], 1), ses('q2', 'CM 2', '2026-09-08T10:00:00', ['b', 'c'], 2)]),
    sec('td1', 'TD', [ses('q3', 'TD 1', '2026-09-03T10:00:00', [], 1)]),
    sec('tp1', 'TP', []),
    sec('pj1', 'Projet', [ses('q4', 'Projet 1', '2026-09-10T10:00:00', ['d'], 1)]),
  ] },
  { id: 'c2', name: 'Électronique', sections: [sec('cm2', 'CM', [ses('q5', 'CM 1', '2026-09-02T10:00:00', ['e'], 1)])] },
  { id: 'c3', name: 'Ancien cours', done: true, sections: [] },
];

test('the search filters courses by name, without accents or case; finished courses are not listed', () => {
  assert.deepEqual(N.navFilterCourses(courses, '').map(c => c.id), ['c1', 'c2']);
  assert.deepEqual(N.navFilterCourses(courses, 'electro').map(c => c.id), ['c2']);
  assert.deepEqual(N.navFilterCourses(courses, ' SIGNAL ').map(c => c.id), ['c1']);
  assert.deepEqual(N.navFilterCourses(courses, 'zzz'), []);
  assert.deepEqual(N.navFilterCourses(null, 'a'), []);
});

test('the deepest id that is valid is the selection; a session knows its section and course', () => {
  const s = N.navResolve(courses, { courseId: 'c1', sectionId: 'td1', sessionId: 'q3' });
  assert.equal(s.kind, 'session');
  assert.equal(s.session.title, 'TD 1');
  assert.equal(s.section.id, 'td1');
  assert.equal(s.course.id, 'c1');
  const noSection = N.navResolve(courses, { courseId: 'c1', sectionId: null, sessionId: 'q3' });
  assert.equal(noSection.section.id, 'td1', 'a session found without its section brings it');
  assert.equal(N.navResolve(courses, { courseId: 'c1', sectionId: 'td1' }).kind, 'section');
  assert.equal(N.navResolve(courses, { courseId: 'c2' }).kind, 'course');
  assert.equal(N.navResolve(courses, {}).kind, null);
  assert.equal(N.navResolve(null, null).course, null);
});

test('stale ids are dropped, never mixed with a valid selection', () => {
  const r = N.navResolve(courses, { courseId: 'c2', sectionId: 'td1', sessionId: 'q3' });
  assert.equal(r.kind, 'course', 'a séance and a section of another course are ignored');
  assert.equal(r.course.id, 'c2');
  assert.equal(r.section, null);
  assert.equal(r.session, null);
  assert.equal(N.navResolve(courses, { courseId: 'c1', sectionId: 'gone', sessionId: 'gone' }).kind, 'course');
  assert.equal(N.navResolve(courses, { courseId: 'gone', sectionId: 'td1' }).kind, null);
});

test('choosing a course clears the type and the séance, a type clears the séance', () => {
  assert.deepEqual(N.navIds('course', { courseId: 'c1', sectionId: 'td1', sessionId: 'q3' }), { courseId: 'c1', sectionId: null, sessionId: null });
  assert.deepEqual(N.navIds('section', { courseId: 'c1', sectionId: 'td1', sessionId: 'q3' }), { courseId: 'c1', sectionId: 'td1', sessionId: null });
  assert.deepEqual(N.navIds('session', { courseId: 'c1', sectionId: 'td1', sessionId: 'q3' }), { courseId: 'c1', sectionId: 'td1', sessionId: 'q3' });
});

test('breadcrumb: course › type › session, each part knows what choosing it selects', () => {
  const crumb = N.navBreadcrumb(courses, { courseId: 'c1', sectionId: 'cm1', sessionId: 'q2' });
  assert.deepEqual(crumb.map(p => p.label), ['Traitement du signal', 'CM', 'CM 2']);
  assert.deepEqual(crumb.map(p => p.kind), ['course', 'section', 'session']);
  assert.deepEqual(crumb[0].ids, { courseId: 'c1', sectionId: null, sessionId: null });
  assert.deepEqual(crumb[1].ids, { courseId: 'c1', sectionId: 'cm1', sessionId: null });
  assert.deepEqual(N.navBreadcrumb(courses, { courseId: 'c2' }).map(p => p.label), ['Électronique']);
  assert.deepEqual(N.navBreadcrumb(courses, { courseId: 'c1', sectionId: 'td1' }).map(p => p.label), ['Traitement du signal', 'TD']);
  assert.deepEqual(N.navBreadcrumb(courses, {}), []);
});

test('screens that follow the selection stay; the others go where the choice fits', () => {
  for (const kind of ['course', 'section', 'session']) {
    assert.equal(N.navTargetView('gallery', kind), 'gallery');
    assert.equal(N.navTargetView('notes', kind), 'notes', 'on Notes the choice decides the page');
    assert.equal(N.navTargetView('pdfBuilder', kind), 'pdfBuilder');
  }
  assert.equal(N.navTargetView('session', 'session'), 'session');
  assert.equal(N.navTargetView('session', 'course'), 'gallery', 'the séance screen needs a séance');
  assert.equal(N.navTargetView('session', 'section'), 'gallery');
  for (const view of ['home', 'files', 'library', 'profile', 'inbox', 'sync', 'live', 'session']) {
    assert.equal(N.navTargetView(view, 'session', true), 'notes', 'tablet / computer: a séance always opens Notes');
  }
  assert.equal(N.navTargetView('gallery', 'session', true), 'gallery');
  assert.equal(N.navTargetView('pdfBuilder', 'session', true), 'pdfBuilder');
  for (const view of ['home', 'files', 'library', 'profile', 'inbox', 'sync', 'live']) {
    assert.equal(N.navTargetView(view, 'course'), 'gallery');
    assert.equal(N.navTargetView(view, 'section'), 'gallery');
    assert.equal(N.navTargetView(view, 'session'), 'session');
  }
});

test('a course tap selects and unfolds it; tapping the selected course folds / unfolds it', () => {
  const open = new Set();
  const none = { kind: null };
  let t = N.navCourseTap(open, none, 'c1');
  assert.deepEqual(t, { select: true, open: true });
  assert.ok(open.has('c1'));
  const selected = N.navResolve(courses, { courseId: 'c1' });
  t = N.navCourseTap(open, selected, 'c1');
  assert.deepEqual(t, { select: false, open: false }, 'tap again: folds');
  assert.ok(!open.has('c1'));
  t = N.navCourseTap(open, selected, 'c1');
  assert.deepEqual(t, { select: false, open: true }, 'and again: unfolds');
  t = N.navCourseTap(open, selected, 'c2');
  assert.deepEqual(t, { select: true, open: true }, 'another course is selected, the first stays as it is');
  assert.ok(open.has('c1') && open.has('c2'));
});

test('a tap on the course while a type or a séance of it is selected goes back to the course', () => {
  const open = new Set(['c1']);
  const deeper = N.navResolve(courses, { courseId: 'c1', sectionId: 'td1', sessionId: 'q3' });
  assert.deepEqual(N.navCourseTap(open, deeper, 'c1'), { select: true, open: true });
  assert.ok(open.has('c1'), 'it stays unfolded');
  const type = N.navResolve(courses, { courseId: 'c1', sectionId: 'td1' });
  assert.deepEqual(N.navCourseTap(open, type, 'c1'), { select: true, open: true });
});

test('a séance for the screens that need one: today\'s, else the latest; within the type when given', () => {
  const c = courses[0];
  assert.equal(N.navPickSession(c, null, { date: new Date('2026-09-20T09:00:00') }).session.id, 'q4', 'nothing today: the latest of the course');
  assert.equal(N.navPickSession(c, c.sections[0], { date: new Date('2026-09-20T09:00:00') }).session.id, 'q2', 'the latest of the type');
  assert.equal(N.navPickSession(c, null, { date: new Date('2026-09-03T18:00:00') }).session.id, 'q3', 'a séance of that day wins');
  assert.equal(N.navPickSession(c, null, { photos: true, date: new Date('2026-09-20') }).session.id, 'q4');
  assert.equal(N.navPickSession(c, c.sections[1], { photos: true, date: new Date('2026-09-20') }).session.id, 'q3', 'only empty séances: the latest of them');
  assert.equal(N.navPickSession(c, c.sections[2]), null, 'a type with no séance');
  assert.equal(N.navPickSession({ sections: [] }), null);
  assert.equal(N.navPickSession(null), null);
  const withPhotos = N.navPickSession({ sections: [sec('x', 'CM', [ses('a', 'CM 1', '2026-09-01', ['p']), ses('b', 'CM 2', '2026-09-09', [])])] }, null, { photos: true, date: new Date('2026-10-01') });
  assert.equal(withPhotos.session.id, 'a', 'with photos: an empty séance loses to one that holds photos');
});

test('the next séance of a type: its number and automatic title', () => {
  assert.deepEqual(N.navNewSession(courses[0].sections[0]), { number: 3, title: 'CM 3' });
  assert.deepEqual(N.navNewSession(courses[0].sections[2]), { number: 1, title: 'TP 1' });
  assert.deepEqual(N.navNewSession(courses[0].sections[3]), { number: 2, title: 'Projet 2' });
  assert.deepEqual(N.navNewSession(null), { number: 1, title: '1' });
});
