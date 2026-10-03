// Notes page document model (features/canvas-doc.js): reading, history, hit tests, text wrapping, growth, merge, PDF cut.
// Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Plain browser script: load it in this realm so arrays compare strictly.
const mod = { exports: {} };
new Function('module', fs.readFileSync(new URL('../features/canvas-doc.js', import.meta.url), 'utf8'))(mod);
const C = mod.exports;

const photo = (id, x, y, w, h, z, extra = {}) => ({ id, type: 'photo', photoId: `ph-${id}`, x, y, w, h, z, updatedAt: 1, ...extra });
const stroke = (id, pts, extra = {}) => ({ id, tool: 'pen', color: '#111827', size: 4, pts, sp: 0, at: 1, updatedAt: 1, ...extra });
const store0 = () => C.canvasStore(C.normalizeCanvasDoc({ sessionId: 's1', items: [photo('a', 10, 10, 200, 100, 1)], strokes: [stroke('s1', [[0, 0, .5], [50, 0, .5]])] }));

test('an empty document: one A4 sheet, ruled, nothing on it', () => {
  const d = C.emptyCanvasDoc('s');
  assert.equal(d.height, 1414);
  assert.equal(d.bg, 'lines');
  assert.ok(C.canvasIsEmpty(d));
});

test('reading a stored document drops broken parts and makes numbers safe', () => {
  const d = C.normalizeCanvasDoc({
    sessionId: 's', height: 'x', bg: 'weird',
    items: [photo('a', 'nope', -50, 100, 100, 1), { id: 'b', type: 'unknown' }, { type: 'photo' }, { id: 'c', type: 'photo' }, null, 'junk',
      { id: 'r', type: 'rect', x: 5, y: 5, w: 50, h: 40, z: 2, color: '#fff', size: 3 }],
    strokes: [{ id: 'x', pts: [] }, { id: 'y', pts: [[1, 2]] }, { id: 'z', pts: [['a', 'b']] }],
    known: ['k', 3, null],
  });
  assert.equal(d.height, 1414);
  assert.equal(d.bg, 'lines');
  assert.deepEqual(d.items.map(i => i.id), ['a', 'r']);
  assert.equal(d.items[0].x, 0, 'a bad number becomes 0');
  assert.equal(d.items[0].y, 0, 'a photo never starts above the page');
  assert.deepEqual(d.strokes.map(s => s.id), ['y']);
  assert.deepEqual(d.strokes[0].pts, [[1, 2, .5]], 'pressure defaults to .5');
  assert.deepEqual(d.known, ['k']);
  assert.equal(C.normalizeCanvasDoc(null, 'q').sessionId, 'q');
});

test('colours are checked when a document is read (they end up in attributes)', () => {
  const evil = '#fff" onload="alert(1)';
  const d = C.normalizeCanvasDoc({ items: [
    { id: 'r', type: 'rect', x: 0, y: 0, w: 10, h: 10, z: 1, color: evil, size: 3 },
    { id: 't', type: 'text', x: 0, y: 0, w: 100, h: 40, z: 2, text: 'x', lines: ['x'], color: 'red', size: 20 },
    { id: 'a', type: 'arrow', p: [0, 0, 10, 10], z: 3, color: '#12ab34', size: 3 }],
  strokes: [{ id: 's', pts: [[1, 1]], color: '"><script>', tool: 'pen', size: 3 }] });
  assert.equal(d.items.find(i => i.id === 'r').color, '#111827', 'a colour with quotes is replaced');
  assert.equal(d.items.find(i => i.id === 't').color, '#111827', 'only hex colours are accepted');
  assert.equal(d.items.find(i => i.id === 'a').color, '#12ab34', 'a normal colour is kept');
  assert.equal(d.strokes[0].color, '#111827');
});

test('the newest edit of an id wins when a list holds it twice', () => {
  const d = C.normalizeCanvasDoc({ items: [photo('a', 0, 0, 10, 10, 1, { updatedAt: 5 }), photo('a', 99, 0, 10, 10, 1, { updatedAt: 9 })] });
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].x, 99);
});

test('text items keep their wrapped lines; arrows get their box from their ends', () => {
  const d = C.normalizeCanvasDoc({ items: [
    { id: 't', type: 'text', x: 1, y: 2, w: 300, h: 60, z: 1, text: 'a\nb', color: '#000', size: 30 },
    { id: 'ar', type: 'arrow', p: [200, 300, 100, 50], x: 0, y: 0, w: 0, h: 0, z: 2, color: '#000', size: 4 }] });
  assert.deepEqual(d.items.find(i => i.id === 't').lines, ['a', 'b'], 'lines default to the text split on line breaks');
  const ar = d.items.find(i => i.id === 'ar');
  assert.deepEqual([ar.x, ar.y, ar.w, ar.h], [100, 50, 100, 250]);
});

// ── history ──
test('undo and redo restore a move exactly, and stamp what they touch', () => {
  const store = store0(), h = C.canvasHistory();
  const before = { ...store.items.get('a') }, after = { ...before, x: 300, y: 400 };
  store.items.set('a', after);
  C.canvasHistoryPush(h, [C.canvasChangeUpdate('i', before, after)]);
  C.canvasUndo(h, store, 777);
  assert.equal(store.items.get('a').x, 10);
  assert.equal(store.items.get('a').updatedAt, 777);
  C.canvasRedo(h, store, 888);
  assert.equal(store.items.get('a').x, 300);
  assert.equal(store.items.get('a').y, 400);
  assert.equal(h.undo.length, 1);
  assert.equal(h.redo.length, 0);
});

test('undoing a creation hides the object (a tombstone, never a hole); redo brings it back', () => {
  const store = store0(), h = C.canvasHistory();
  const s = stroke('new', [[5, 5, .5], [9, 9, .5]]);
  store.strokes.set('new', s);
  C.canvasHistoryPush(h, [C.canvasChangeCreate('s', s)]);
  C.canvasUndo(h, store, 10);
  assert.equal(store.strokes.get('new').deleted, true, 'kept as a tombstone so other devices hear about it');
  C.canvasRedo(h, store, 11);
  assert.equal(store.strokes.get('new').deleted, undefined);
  assert.equal(store.strokes.get('new').updatedAt, 11);
});

test('a deletion is undoable, and one action with several changes undoes as a whole', () => {
  const store = store0(), h = C.canvasHistory();
  const a = store.items.get('a'), s = store.strokes.get('s1');
  store.items.set('a', { ...a, deleted: true });
  store.strokes.set('s1', { ...s, deleted: true });
  C.canvasHistoryPush(h, [C.canvasChangeRemove('i', a), C.canvasChangeRemove('s', s)]);
  C.canvasUndo(h, store, 5);
  assert.equal(store.items.get('a').deleted, undefined);
  assert.equal(store.strokes.get('s1').deleted, undefined);
});

test('a new edit empties the redo list; history is bounded; undo on nothing is a no-op', () => {
  const store = store0(), h = C.canvasHistory();
  assert.equal(C.canvasUndo(h, store, 1), null);
  assert.equal(C.canvasRedo(h, store, 1), null);
  const a = store.items.get('a');
  C.canvasHistoryPush(h, [C.canvasChangeUpdate('i', a, { ...a, x: 1 })]);
  C.canvasUndo(h, store, 2);
  assert.equal(h.redo.length, 1);
  C.canvasHistoryPush(h, [C.canvasChangeUpdate('i', a, { ...a, x: 2 })]);
  assert.equal(h.redo.length, 0);
  for (let i = 0; i < 400; i++) C.canvasHistoryPush(h, [C.canvasChangeUpdate('i', a, { ...a, x: i })]);
  assert.equal(h.undo.length, 300);
  C.canvasHistoryPush(h, []);
  assert.equal(h.undo.length, 300, 'an empty action is not recorded');
});

test('page changes (height, background) are part of the history too', () => {
  const store = store0(), h = C.canvasHistory();
  const before = { ...store.page }, after = { ...store.page, bg: 'grid' };
  Object.assign(store.page, after);
  C.canvasHistoryPush(h, [C.canvasChangePage({ bg: before.bg }, { bg: 'grid' })]);
  C.canvasUndo(h, store, 42);
  assert.equal(store.page.bg, 'lines');
  assert.equal(store.page.bgAt, 42, 'the background choice is stamped so it wins on the other devices');
  const hh = C.canvasHistory();
  C.canvasHistoryPush(hh, [C.canvasChangePage({ height: 1414 }, { height: 2114 })]);
  store.page.height = 2114;
  C.canvasUndo(hh, store, 43);
  assert.equal(store.page.height, 1414);
});

test('serialising keeps items by z and strokes by creation, and round-trips through reading', () => {
  const store = C.canvasStore(C.normalizeCanvasDoc({ items: [photo('b', 0, 0, 10, 10, 5), photo('a', 0, 0, 10, 10, 2)], strokes: [stroke('s2', [[1, 1]], { at: 9 }), stroke('s1', [[1, 1]], { at: 3 })] }));
  const doc = C.canvasSerialize(store, 123);
  assert.deepEqual(doc.items.map(i => i.id), ['a', 'b']);
  assert.deepEqual(doc.strokes.map(s => s.id), ['s1', 's2']);
  assert.equal(doc.updatedAt, 123);
  assert.deepEqual(C.normalizeCanvasDoc(JSON.parse(JSON.stringify(doc))), doc);
});

// ── geometry ──
test('hit test: topmost first; a rectangle only at its edge; an arrow near its line', () => {
  const items = C.normalizeCanvasDoc({ items: [
    photo('low', 0, 0, 400, 400, 1),
    photo('high', 100, 100, 100, 100, 3),
    { id: 'frame', type: 'rect', x: 50, y: 50, w: 300, h: 300, z: 2, color: '#000', size: 4 },
    { id: 'arr', type: 'arrow', p: [500, 500, 700, 500], z: 4, color: '#000', size: 4 }] }).items;
  assert.equal(C.canvasHitItem(items, 150, 150).id, 'high');
  assert.equal(C.canvasHitItem(items, 300, 300).id, 'low', 'inside a frame: the photo under it, not the frame');
  assert.equal(C.canvasHitItem(items, 51, 200).id, 'frame', 'on the frame edge (above the photo it is drawn over)');
  assert.equal(C.canvasHitItem(items, 600, 506).id, 'arr');
  assert.equal(C.canvasHitItem(items, 600, 560), null);
  assert.equal(C.canvasHitItem(items, 900, 900), null);
  const gone = items.map(i => i.id === 'high' ? { ...i, deleted: true } : i);
  assert.equal(C.canvasHitItem(gone, 150, 150).id, 'low', 'removed items are not hit');
});

test('stroke hit: near the line counts, its own width too', () => {
  const s = stroke('x', [[0, 0, .5], [100, 0, .5]], { size: 10 });
  assert.ok(C.canvasStrokeHit(s, 50, 4, 0));
  assert.ok(!C.canvasStrokeHit(s, 50, 20, 0));
  assert.ok(C.canvasStrokeHit(s, 50, 20, 16), 'the eraser radius adds to the reach');
  assert.ok(C.canvasStrokeHit(stroke('dot', [[10, 10, .5]], { size: 6 }), 12, 10, 0), 'a dot');
  assert.ok(!C.canvasStrokeHit(stroke('dot', [[10, 10, .5]], { size: 6 }), 30, 10, 0));
});

test('the page grows near its bottom, by steps, up to a ceiling', () => {
  assert.equal(C.canvasGrownHeight(1414, 500), null);
  assert.equal(C.canvasGrownHeight(1414, 1414 - 361), null);
  assert.equal(C.canvasGrownHeight(1414, 1055), 1780, 'one unit inside the margin: grows by a step');
  assert.equal(C.canvasGrownHeight(1414, 5000), 5720);
  assert.equal(C.canvasGrownHeight(39990, 39990), 40000);
  assert.equal(C.canvasGrownHeight(40000, 40000), null, 'at the ceiling it stops');
});

test('z-order: the next item goes on top', () => {
  assert.equal(C.canvasNextZ([]), 1);
  assert.equal(C.canvasNextZ([{ z: 3 }, { z: 7 }, { z: 1 }]), 8);
});

test('shape paths are plain SVG data (also used by Path2D in the PDF)', () => {
  assert.equal(C.canvasRectPath({ x: 10, y: 20, w: 100, h: 50 }), 'M10 20H110V70H10Z');
  const d = C.canvasArrowPath([0, 0, 100, 0], 4);
  assert.match(d, /^M0 0L100 0M/);
  assert.equal((d.match(/L/g) || []).length, 3, 'shaft + two sides of the head');
  assert.ok(C.canvasArrowPath([0, 0, 100, 0], 8).length > 0);
});

test('perfect-freehand outline becomes a closed path', () => {
  const d = C.canvasOutlinePath([[0, 0], [10, 0], [10, 10], [0, 10]]);
  assert.match(d, /^M 0 0 Q /);
  assert.match(d, / Z$/);
  assert.equal(C.canvasOutlinePath([]), '');
});

// ── text ──
const mono = t => t.length * 10;   // every character 10 units wide
test('text wrapping: greedy at spaces, keeps line breaks and blank lines', () => {
  assert.deepEqual(C.canvasLayoutText('aaa bbb ccc', 70, mono), ['aaa bbb', 'ccc']);
  assert.deepEqual(C.canvasLayoutText('aaa bbb ccc', 1000, mono), ['aaa bbb ccc']);
  assert.deepEqual(C.canvasLayoutText('one\n\ntwo', 1000, mono), ['one', '', 'two']);
  assert.deepEqual(C.canvasLayoutText('', 100, mono), ['']);
  assert.deepEqual(C.canvasLayoutText('a\r\nb', 100, mono), ['a', 'b']);
});

test('text wrapping: a word wider than the box is cut, also after a short word', () => {
  assert.deepEqual(C.canvasLayoutText('abcdefghij', 40, mono), ['abcd', 'efgh', 'ij']);
  assert.deepEqual(C.canvasLayoutText('hi abcdefghij', 40, mono), ['hi', 'abcd', 'efgh', 'ij']);
  for (const l of C.canvasLayoutText('x '.repeat(30) + 'supercalifragilistic end', 90, mono)) assert.ok(mono(l) <= 90, `"${l}" fits`);
});

test('text height follows the lines', () => {
  assert.equal(C.canvasLineHeight(30), 41.4);
  assert.equal(C.canvasTextHeight(1, 30), 41.4 + 20);
  assert.equal(C.canvasTextHeight(3, 30), 3 * 41.4 + 20);
  assert.equal(C.canvasTextHeight(0, 30), 41.4 + 20, 'an empty box is one line high');
});

// ── sync ──
test('merging two devices: per id, the newest edit wins; deletions travel; nothing is lost', () => {
  const a = { sessionId: 's', height: 2000, bg: 'lines', bgAt: 1, updatedAt: 10,
    items: [photo('p1', 0, 0, 100, 100, 1, { updatedAt: 10 }), photo('p2', 0, 0, 100, 100, 2, { updatedAt: 5, x: 1 })],
    strokes: [stroke('s1', [[1, 1]], { updatedAt: 3 })], known: ['k1'] };
  const b = { sessionId: 's', height: 3500, bg: 'grid', bgAt: 9, updatedAt: 20,
    items: [photo('p1', 400, 0, 100, 100, 1, { updatedAt: 4 }), photo('p2', 0, 0, 100, 100, 2, { updatedAt: 15, deleted: true }), photo('p3', 0, 0, 10, 10, 3, { updatedAt: 6 })],
    strokes: [stroke('s2', [[2, 2]], { updatedAt: 7, at: 2 })], known: ['k2'] };
  const m = C.canvasMerge(a, b);
  assert.equal(m.height, 3500, 'the taller page');
  assert.equal(m.bg, 'grid', 'the later background choice');
  assert.equal(m.items.find(i => i.id === 'p1').x, 0, 'a: newer');
  assert.equal(m.items.find(i => i.id === 'p2').deleted, true, 'b deleted it later');
  assert.ok(m.items.some(i => i.id === 'p3'), 'only on b: kept');
  assert.deepEqual(m.strokes.map(s => s.id), ['s1', 's2']);
  assert.deepEqual(m.known.sort(), ['k1', 'k2']);
  assert.equal(m.updatedAt, 20);
  assert.deepEqual(C.canvasMerge(m, a), C.canvasMerge(a, m), 'order does not matter');
  assert.deepEqual(C.canvasMerge(m, m), m, 'merging with itself changes nothing');
});

test('same content whatever the time stamps; a removed object is not content', () => {
  const a = { sessionId: 's', items: [photo('p', 0, 0, 100, 100, 1, { updatedAt: 1 })], strokes: [] };
  const b = { sessionId: 's', updatedAt: 99, items: [photo('p', 0, 0, 100, 100, 1, { updatedAt: 50 }), photo('gone', 0, 0, 1, 1, 2, { deleted: true, updatedAt: 60 })], strokes: [] };
  assert.ok(C.canvasSameContent(a, b));
  assert.ok(!C.canvasSameContent(a, { ...b, items: [photo('p', 5, 0, 100, 100, 1)] }));
});

test('old removed objects are forgotten after 60 days, recent ones are kept', () => {
  const now = 1e12, day = 864e5;
  const d = C.normalizeCanvasDoc({ items: [photo('old', 0, 0, 1, 1, 1, { deleted: true, updatedAt: now - 61 * day }), photo('new', 0, 0, 1, 1, 2, { deleted: true, updatedAt: now - 5 * day }), photo('live', 0, 0, 1, 1, 3, { updatedAt: now - 99 * day })] });
  C.canvasPrune(d, now);
  assert.deepEqual(d.items.map(i => i.id), ['new', 'live']);
});

// ── PDF ──
test('the PDF has as many A4 sheets as the page uses, never a blank one at the end', () => {
  const doc = id => C.normalizeCanvasDoc({ height: 5000, items: id });
  assert.equal(C.canvasPdfPageCount(C.normalizeCanvasDoc({})), 1, 'an empty page is still one sheet');
  assert.equal(C.canvasPdfPageCount(doc([photo('a', 0, 0, 100, 100, 1)])), 1);
  assert.equal(C.canvasPdfPageCount(doc([photo('a', 0, 1300, 100, 200, 1)])), 2, 'spills over the sheet edge');
  assert.equal(C.canvasPdfPageCount(doc([photo('a', 0, 4000, 100, 100, 1)])), 3);
  assert.equal(C.canvasPdfPageCount(doc([photo('a', 0, 4900, 100, 400, 1)])), 4, 'never beyond the page height');
  const slices = C.canvasPdfSlices(doc([photo('a', 0, 1300, 100, 200, 1)]));
  assert.deepEqual(slices, [{ y0: 0, y1: 1414 }, { y0: 1414, y1: 2828 }]);
});

test('a removed item does not make the PDF longer', () => {
  const d = C.normalizeCanvasDoc({ height: 6000, items: [photo('a', 0, 10, 100, 100, 1), photo('far', 0, 5000, 100, 100, 2, { deleted: true })] });
  assert.equal(C.canvasPdfPageCount(d), 1);
});

// ── tray ──
test('tray: new = in the séance, not shown before, not placed; placed ones are known', () => {
  const doc = C.normalizeCanvasDoc({ items: [photo('x', 0, 0, 10, 10, 1, { photoId: 'p2' })], known: ['p1'] });
  assert.deepEqual([...C.canvasPlacedPhotoIds(doc)], ['p2']);
  assert.deepEqual(C.canvasNewPhotoIds(['p1', 'p2', 'p3'], doc), ['p3']);
  const removed = C.normalizeCanvasDoc({ items: [photo('x', 0, 0, 10, 10, 1, { photoId: 'p2', deleted: true })] });
  assert.deepEqual([...C.canvasPlacedPhotoIds(removed)], [], 'a removed photo is no longer placed');
});

test('a photo is placed at its own proportions', () => {
  assert.deepEqual(C.canvasPhotoSize(4 / 3), { w: 460, h: 345 });
  assert.deepEqual(C.canvasPhotoSize(3 / 4), { w: 340, h: 453.3 });
  assert.deepEqual(C.canvasPhotoSize(0), { w: 460, h: 345 }, 'unknown proportions: 4/3');
});

// ── Shape snap and partial eraser ──
const jitter = (i) => Math.sin(i * 12.9898) * 1.4;
const along = (n, f) => Array.from({ length: n }, (_, i) => { const [x, y] = f(i / (n - 1)); return [x + jitter(i), y + jitter(i + 7), .5]; });

test('shape snap: a wobbly line becomes a straight one, a horizontal one is levelled', () => {
  const r = C.canvasSnapShape(along(40, t => [100 + 300 * t, 200 + 6 * t]));
  assert.equal(r.kind, 'line');
  assert.ok(Math.abs(r.pts[0][1] - r.pts.at(-1)[1]) < 1e-6, 'levelled');
  const diag = C.canvasSnapShape(along(40, t => [100 + 300 * t, 100 + 200 * t]));
  assert.equal(diag.kind, 'line');
  assert.ok(diag.pts.length > 10 && Math.abs(diag.pts[0][1] - diag.pts.at(-1)[1]) > 100);
});

test('shape snap: circle, ellipse, rectangle, triangle', () => {
  assert.equal(C.canvasSnapShape(along(60, t => [300 + 80 * Math.cos(t * 6.4), 300 + 80 * Math.sin(t * 6.4)])).kind, 'circle');
  assert.equal(C.canvasSnapShape(along(60, t => [300 + 150 * Math.cos(t * 6.4), 300 + 60 * Math.sin(t * 6.4)])).kind, 'ellipse');
  const side = (a, b) => (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const poly = (v) => v.flatMap((a, i) => along(15, side(a, v[(i + 1) % v.length])));
  const rect = C.canvasSnapShape(poly([[100, 100], [300, 104], [298, 220], [102, 218]]));
  assert.equal(rect.kind, 'rect');
  assert.deepEqual([rect.pts[0][1], rect.pts[0][1]].length, 2);
  assert.equal(C.canvasSnapShape(poly([[100, 300], [260, 300], [180, 160]])).kind, 'polygon');
});

test('shape snap leaves handwriting, scribbles and small marks alone', () => {
  assert.equal(C.canvasSnapShape(along(30, t => [10 + 20 * Math.cos(t * 6.4), 10 + 20 * Math.sin(t * 6.4)])), null, 'small circle = a letter o');
  assert.equal(C.canvasSnapShape(along(50, t => [100 + 300 * t, 200 + 70 * Math.sin(t * 14)])), null, 'a wave');
  assert.equal(C.canvasSnapShape([[0, 0, .5]]), null);
});

test('partial eraser cuts the touched part and keeps both ends', () => {
  const s = stroke('l', [[0, 0, .5], [100, 0, .5]], { size: 4 });
  assert.equal(C.canvasEraseSplit(s, 50, 50, 10), null, 'untouched');
  const pieces = C.canvasEraseSplit(s, 50, 0, 10);
  assert.equal(pieces.length, 2);
  assert.ok(pieces[0].at(-1)[0] < 40 && pieces[1][0][0] > 60);
  assert.deepEqual(C.canvasEraseSplit(s, 0, 0, 30)?.length, 1, 'cut at the end leaves one piece');
  assert.deepEqual(C.canvasEraseSplit(stroke('t', [[0, 0, .5], [6, 0, .5]]), 3, 0, 30), [], 'all gone');
});
