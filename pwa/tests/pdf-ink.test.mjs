// PDF viewer ink (features/pdf/pdf-ink.js): stored strokes, the two eraser modes and undo, on top of the Notes document model.
// Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import { readAppFile } from './helpers/app-files.mjs';

const mod = { exports: {} };
const src = readAppFile;
new Function('module', `${src('canvas-doc.js')}\n${src('pdf-ink.js')}\n`)(mod);
const C = mod.exports;

const stroke = (id, pg, pts, extra = {}) => ({ id, tool: 'pen', color: '#111827', size: 4, pts, sp: 0, at: 1, updatedAt: 1, pg, ...extra });
const line = (n, y = 100) => Array.from({ length: n }, (_, i) => [i * 10, y, .5]);
let n = 0;
const newId = () => `n${++n}`;

test('stored ink is read back per page; broken or page-less strokes are dropped', () => {
  const list = C.pdfInkStrokes({ strokes: [stroke('a', 2, line(5)), stroke('b', 0, line(5)), stroke('c', 'x', line(5)), { id: 'd', pg: 1, pts: [] }, null, stroke('e', 1, line(3), { deleted: true })] });
  assert.deepEqual(list.map(s => [s.id, s.pg]), [['a', 2]]);
  assert.equal(C.pdfInkStrokes(undefined).length, 0);
  assert.equal(C.pdfInkKey('f1'), 'pdfink:f1');
});

test('whole-stroke eraser removes only the stroke touched, on its own page', () => {
  const strokes = new Map([['a', stroke('a', 1, line(20))], ['b', stroke('b', 1, line(20, 400))], ['c', stroke('c', 2, line(20))]]);
  const er = { partial: false, before: [], created: new Map() };
  const r = C.pdfInkEraseAt(strokes, er, 1, 50, 102, 22, newId);
  assert.deepEqual(r.removed, ['a']);
  assert.ok(strokes.get('a').deleted);
  assert.ok(!strokes.get('b').deleted && !strokes.get('c').deleted);
});

test('partial eraser cuts the touched part and keeps the rest as new strokes', () => {
  const strokes = new Map([['a', stroke('a', 1, line(30))]]);
  const er = { partial: true, before: [], created: new Map() };
  const r = C.pdfInkEraseAt(strokes, er, 1, 150, 100, 22, newId);
  assert.deepEqual(r.removed, ['a']);
  assert.equal(r.added.length, 2);
  assert.ok(r.added.every(s => s.pg === 1 && s.color === '#111827' && s.pts.length > 1));
  assert.ok(r.added[0].pts.at(-1)[0] < 150 && r.added[1].pts[0][0] > 150);
});

test('an erase gesture is one undo step; undo brings the original back', () => {
  const strokes = new Map([['a', stroke('a', 1, line(30))]]);
  const store = { strokes, items: new Map() }, hist = C.canvasHistory();
  const er = { partial: true, before: [], created: new Map() };
  C.pdfInkEraseAt(strokes, er, 1, 150, 100, 22, newId);
  C.pdfInkEraseAt(strokes, er, 1, 60, 100, 22, newId);   // second pass cuts a piece made in the same gesture
  C.canvasHistoryPush(hist, C.pdfInkEraseChanges(er));
  assert.equal(hist.undo.length, 1);
  assert.ok(strokes.get('a').deleted);
  C.canvasUndo(hist, store);
  const live = [...strokes.values()].filter(s => !s.deleted);
  assert.deepEqual(live.map(s => s.id), ['a']);
});
