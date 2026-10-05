// Characterization of the Notes page (pages/NotesCanvasPage.js + features/canvas-*.js) on a tablet: the real app
// booted in jsdom, the page driven through its own buttons and functions. Locks the page's DOM, its stored document
// (IndexedDB kv `canvas:<séance>`), the history and the save indicator, so the file can be split without a change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, sampleState, SESSION_1 } from './helpers/boot-app.mjs';

const plain = (x) => JSON.parse(JSON.stringify(x));
const here = { courseId: 'c1', sectionId: 's1', sessionId: SESSION_1 };
const tablet = async (fn, options = {}) => {
  const app = await bootApp({ width: 1024, height: 768, ...options });
  try {
    await app.go('notes', here);
    await fn(app);
  } finally {
    app.close();
  }
};
const $ = (app, sel) => app.win.document.querySelector(sel);
const $$ = (app, sel) => [...app.win.document.querySelectorAll(sel)];
const stored = (app) => plain(app.db.stores.kv.get(`canvas:${SESSION_1}`)?.doc ?? null);
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

test('opening the Notes page builds the sheet, the tools and the tray for the selected séance', async () => {
  await tablet((app) => {
    assert.equal(app.ev('currentView'), 'notes');
    assert.equal(app.ev('canvasSessionId()'), SESSION_1);
    assert.ok($(app, '.cv-sheet'));
    assert.deepEqual(
      $$(app, '[data-cv-tool]').map((b) => b.dataset.cvTool),
      plain(app.ev('CANVAS_TOOLS')),
    );
    assert.equal($$(app, '[data-cv-bg]').length, 3);
    assert.equal(app.ev('canvasRuntime.tool'), 'hand');
    assert.equal(app.ev('canvasRuntime.store.page.bg'), 'lines');
    assert.equal(app.ev('canvasRuntime.store.page.height'), app.ev('CANVAS_PAGE_H'));
    assert.match($(app, '.cv-tray').textContent, /Aucune photo dans cette séance/);
    assert.equal($(app, '#cvStatus').textContent.trim(), 'Enregistré');
    assert.equal($(app, '#cvUndo').disabled, true);
    assert.equal(stored(app), null, 'nothing is written until something is edited');
  });
});

test('background and added space are history steps: undo / redo, "Enregistrement…" then "Enregistré", one stored document', async () => {
  await tablet(async (app) => {
    const startHeight = app.ev('canvasRuntime.store.page.height');
    $(app, '[data-cv-bg="grid"]').click();
    assert.equal(app.ev('canvasRuntime.store.page.bg'), 'grid');
    assert.equal(app.ev('canvasRuntime.hist.undo.length'), 1);
    assert.equal($(app, '#cvStatus').textContent.trim(), 'Enregistrement…');
    assert.equal($(app, '#cvUndo').disabled, false);
    $(app, '[data-cv-space]').click();
    assert.equal(app.ev('canvasRuntime.store.page.height'), startHeight + app.ev('CANVAS_ADD_SPACE'));
    await app.ev('canvasSave(canvasRuntime)');
    assert.equal($(app, '#cvStatus').textContent.trim(), 'Enregistré');
    const doc = stored(app);
    assert.equal(doc.bg, 'grid');
    assert.equal(doc.height, startHeight + app.ev('CANVAS_ADD_SPACE'));
    assert.equal(doc.sessionId, SESSION_1);
    $(app, '#cvUndo').click();
    assert.equal(app.ev('canvasRuntime.store.page.height'), startHeight);
    $(app, '#cvUndo').click();
    assert.equal(app.ev('canvasRuntime.store.page.bg'), 'lines');
    $(app, '#cvRedo').click();
    assert.equal(app.ev('canvasRuntime.store.page.bg'), 'grid');
  });
});

test('a text box: typed, wrapped once, stored, undone and redone', async () => {
  await tablet(async (app) => {
    app.ev('canvasNewText(canvasRuntime,{x:120,y:200})');
    const ta = $(app, '.cv-item textarea');
    assert.ok(ta, 'the text area of the new box');
    ta.value = 'Bonjour le monde';
    app.ev('canvasCommitText(canvasRuntime)');
    const items = plain(app.ev('[...canvasRuntime.store.items.values()]'));
    assert.equal(items.length, 1);
    assert.equal(items[0].type, 'text');
    assert.equal(items[0].text, 'Bonjour le monde');
    assert.deepEqual(items[0].lines, ['Bonjour le monde']);
    assert.equal(items[0].x, 120);
    assert.equal($$(app, '.cv-item').length, 1);
    assert.match($(app, '.cv-item').textContent, /Bonjour le monde/);
    assert.equal(app.ev('canvasRuntime.hist.undo.length'), 1);
    await app.ev('canvasSave(canvasRuntime)');
    assert.deepEqual(
      stored(app).items.map((i) => [i.type, i.text]),
      [['text', 'Bonjour le monde']],
    );
    $(app, '#cvUndo').click();
    assert.equal($$(app, '.cv-item').length, 0, 'undo removes the box from the sheet');
    assert.equal(app.ev('[...canvasRuntime.store.items.values()].filter(i=>!i.deleted).length'), 0);
    $(app, '#cvRedo').click();
    assert.equal($$(app, '.cv-item').length, 1);
    app.ev('canvasNewText(canvasRuntime,{x:300,y:400})');
    app.ev('canvasCommitText(canvasRuntime)');
    assert.equal($$(app, '.cv-item').length, 1, 'an empty box disappears when editing ends');
  });
});

test('ink: a stroke becomes one SVG path; erasing it is a history step; the stored document keeps it', async () => {
  await tablet(async (app) => {
    app.ev(`(()=>{const rt=canvasRuntime;
      const s={id:'stroke-1',tool:'pen',color:'#111111',size:2,pts:[[10,10,.5],[60,40,.5],[120,50,.5]],sp:0,at:1,updatedAt:0};
      rt.store.strokes.set(s.id,s);canvasCommit(rt,[canvasChangeCreate('s',s)]);canvasSyncInk(rt)})()`);
    const paths = $$(app, '.cv-ink path');
    assert.equal(paths.length, 1);
    assert.match(paths[0].getAttribute('d'), /^M/);
    assert.equal(paths[0].getAttribute('d'), app.ev(`canvasStrokePathD(canvasRuntime.store.strokes.get('stroke-1'))`));
    await app.ev('canvasSave(canvasRuntime)');
    assert.deepEqual(stored(app).strokes.map((s) => [s.id, s.tool, s.pts.length]), [['stroke-1', 'pen', 3]]);
    $(app, '#cvUndo').click();
    assert.equal($$(app, '.cv-ink path').length, 0);
    $(app, '#cvRedo').click();
    assert.equal($$(app, '.cv-ink path').length, 1);
  });
});

test('the page survives leaving and coming back: it is read from the stored document', async () => {
  await tablet(async (app) => {
    app.ev('canvasNewText(canvasRuntime,{x:50,y:80})');
    $(app, '.cv-item textarea').value = 'Reste';
    app.ev('canvasCommitText(canvasRuntime)');
    $(app, '[data-cv-bg="blank"]').click();
    await app.ev('canvasSave(canvasRuntime)');
    app.ev('canvasDiscardRuntime()');
    await app.go('files');
    assert.equal(app.ev('canvasRuntime'), null, 'leaving the page cleans its runtime');
    await app.go('notes', here);
    assert.equal(app.ev('canvasRuntime.store.page.bg'), 'blank');
    assert.match($(app, '.cv-item').textContent, /Reste/);
  });
});

test('a photo of the séance is offered in the tray until it is placed', async () => {
  const photoId = '99999999-aaaa-4aaa-8aaa-000000000001';
  const state = sampleState();
  state.courses[0].sections[0].sessions[0].photoIds = [photoId];
  await tablet(
    (app) => {
      const tray = $(app, '.cv-tray');
      assert.ok(tray);
      assert.equal(app.ev('canvasTrayIds(canvasRuntime).length'), 1);
      assert.match(tray.innerHTML, new RegExp(photoId));
    },
    { state },
  );
});

test('the toolbar status follows the save: error when the device cannot store the page', async () => {
  await tablet(async (app) => {
    app.db.put = async () => {
      throw new Error('full');
    };
    $(app, '[data-cv-bg="grid"]').click();
    await app.ev('canvasSave(canvasRuntime)');
    await tick();
    assert.equal($(app, '#cvStatus').textContent.trim(), 'Non enregistré');
    assert.match(app.win.document.getElementById('toast').textContent, /Page non enregistrée/);
    assert.equal(app.ev('canvasRuntime.dirty'), true, 'still dirty: it is tried again');
  });
});
