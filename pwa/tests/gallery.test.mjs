import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The app files are plain browser scripts: load this one (in this realm, so arrays compare strictly) and use its functions.
const mod = { exports: {} };
new Function('module', fs.readFileSync(new URL('../features/gallery-logic.js', import.meta.url), 'utf8'))(mod);
const G = mod.exports;

const sec = (name, type, sessions) => ({ id: `s-${name}`, name, type: type || name, sessions });
const ses = (title, photoIds) => ({ id: `q-${title}`, title, photoIds });
const course = {
  id: 'c1', name: 'VHDL', sections: [
    sec('CM', 'CM', [ses('CM 1', ['a', 'b', 'c']), ses('CM 2', ['d'])]),
    sec('TD', 'TD', [ses('TD 1', ['e', 'f'])]),
    sec('TP', 'TP', []),
    sec('Projet', 'CUSTOM', [ses('Projet 1', ['g'])]),
  ],
};

test('"Tous" lists every photo in section, séance, photo order', () => {
  assert.deepEqual(G.galleryEntries(course, 'all').map(e => e.id), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
});

test('a CM / TD / TP filter keeps only that section; custom sections only show under "Tous"', () => {
  assert.deepEqual(G.galleryEntries(course, 'CM').map(e => e.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(G.galleryEntries(course, 'TD').map(e => e.id), ['e', 'f']);
  assert.deepEqual(G.galleryEntries(course, 'TP').map(e => e.id), []);
});

test('entries remember their séance and place in it', () => {
  const e = G.galleryEntries(course, 'CM').find(x => x.id === 'd');
  assert.equal(e.session.title, 'CM 2');
  assert.equal(e.index, 0);
  assert.equal(e.section.name, 'CM');
});

test('a photo listed in two séances shows once', () => {
  const c = { sections: [sec('CM', 'CM', [ses('CM 1', ['a', 'b']), ses('CM 2', ['b', 'c'])])] };
  assert.deepEqual(G.galleryEntries(c, 'all').map(e => e.id), ['a', 'b', 'c']);
});

test('a section is found by its name even when its type differs', () => {
  const c = { sections: [{ id: 'x', name: ' td ', type: 'CUSTOM', sessions: [ses('t', ['p'])] }] };
  assert.deepEqual(G.galleryEntries(c, 'TD').map(e => e.id), ['p']);
});

test('the navigator selects a section by its id (custom sections too) and a séance narrows further', () => {
  assert.deepEqual(G.galleryEntries(course, 's-Projet').map(e => e.id), ['g']);
  assert.deepEqual(G.galleryEntries(course, 's-CM').map(e => e.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(G.galleryEntries(course, 's-CM', 'q-CM 2').map(e => e.id), ['d']);
  assert.deepEqual(G.galleryEntries(course, 'all', 'q-TD 1').map(e => e.id), ['e', 'f']);
  assert.deepEqual(G.galleryEntries(course, 's-TD', 'q-CM 1').map(e => e.id), [], 'a séance outside the section shows nothing');
  assert.deepEqual(G.galleryEntries(course, 'all', 'gone').map(e => e.id), []);
});

test('default course: the one asked for, else the last used, else the first running one', () => {
  const cs = [{ id: 'a', done: true }, { id: 'b' }, { id: 'c' }];
  assert.equal(G.galleryDefaultCourse(cs, 'c', 'b').id, 'c');
  assert.equal(G.galleryDefaultCourse(cs, 'zzz', 'c').id, 'c');
  assert.equal(G.galleryDefaultCourse(cs, null, null).id, 'b');
  assert.equal(G.galleryDefaultCourse(cs, 'a', null).id, 'a', 'a finished course can still be opened');
  assert.equal(G.galleryDefaultCourse([], null, null), null);
});

test('camera destination section: the filter first, then the last used, then the first', () => {
  assert.equal(G.galleryCaptureSection(course, 'TD').name, 'TD');
  assert.equal(G.galleryCaptureSection(course, 'all', 's-TD').name, 'TD');
  assert.equal(G.galleryCaptureSection(course, 'all', 'gone').name, 'CM');
  assert.equal(G.galleryCaptureSection(course, 'all').name, 'CM');
  const noTp = { sections: [sec('CM', 'CM', [])] };
  assert.equal(G.galleryCaptureSection(noTp, 'TP').name, 'CM', 'a filter with no section falls back');
  assert.equal(G.galleryCaptureSection({ sections: [] }, 'all'), null);
});

test('change position moves one photo and keeps the others in order', () => {
  assert.deepEqual(G.galleryMoveInList(['a', 'b', 'c', 'd'], 'a', 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(G.galleryMoveInList(['a', 'b', 'c', 'd'], 'd', 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(G.galleryMoveInList(['a', 'b', 'c'], 'b', 99), ['a', 'c', 'b']);
  assert.deepEqual(G.galleryMoveInList(['a', 'b', 'c'], 'b', -5), ['b', 'a', 'c']);
  assert.deepEqual(G.galleryMoveInList(['a', 'b'], 'zzz', 0), ['a', 'b']);
});

test('galleryPdfs: the PDFs of the selected séance or section; nothing selected, the whole course', () => {
  const course = { sections: [
    { id: 'td', sessions: [{ id: 's1' }, { id: 's2' }] },
    { id: 'tp', sessions: [{ id: 's3' }] }] };
  const files = [{ id: 'a', sessionIds: ['s1'] }, { id: 'b', sessionIds: ['s2', 's3'] }, { id: 'c', sessionIds: [] }, { id: 'd' }];
  const ids = list => list.map(f => f.id);
  assert.deepEqual(ids(G.galleryPdfs(files, course, 'td', 's1')), ['a']);
  assert.deepEqual(ids(G.galleryPdfs(files, course, 'td', 's3')), [], 'a séance of another section is not this section\'s');
  assert.deepEqual(ids(G.galleryPdfs(files, course, 'td')), ['a', 'b']);
  assert.deepEqual(ids(G.galleryPdfs(files, course, null, 's3')), ['b']);
  assert.deepEqual(ids(G.galleryPdfs(files, course)), ['a', 'b'], 'whole course: every PDF of its séances');
  assert.deepEqual(ids(G.galleryPdfs([...files, { id: 'e', courseId: 'c1', sessionIds: [] }], { id: 'c1', ...course })), ['a', 'b', 'e'], 'and those filed in the course alone');
  assert.deepEqual(G.galleryPdfs(undefined, undefined, 'td'), []);
});
