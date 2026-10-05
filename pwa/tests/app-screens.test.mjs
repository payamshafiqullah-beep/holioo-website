// Characterization of what every screen shows: the real app (scripts of index.html) is booted in jsdom in test mode,
// every screen is drawn on a phone and on a tablet, and the markup is compared with the stored snapshot.
// A refactor that moves or splits files must leave these identical. Update on purpose: UPDATE_SNAPSHOTS=1 npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bootApp, SESSION_1 } from './helpers/boot-app.mjs';

const FILE = new URL('./__snapshots__/screens.json', import.meta.url);
const update = process.env.UPDATE_SNAPSHOTS === '1';
const stored = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const fresh = {};

const here = { courseId: 'c1', sectionId: 's1', sessionId: SESSION_1 };
const PHONE = [
  ['home'],
  ['courses'],
  ['course', { courseId: 'c1' }],
  ['section', { courseId: 'c1', sectionId: 's1' }],
  ['session', here],
  ['inbox'],
  ['files'],
  ['library'],
  ['profile'],
  ['sync'],
  ['pdfBuilder'],
  ['people'],
  ['holiooShares'],
  ['mySharedPdfs'],
  ['academicSetup'],
];
const TABLET = [
  ['home'],
  ['gallery', { courseId: 'c1' }],
  ['notes', here],
  ['live', here],
  ['courses'],
  ['session', here],
  ['files'],
  ['library'],
  ['profile'],
  ['sync'],
  ['inbox'],
  ['pdfBuilder'],
  ['people'],
];

for (const [mode, width, height, views] of [
  ['phone', 390, 844, PHONE],
  ['tablet', 1024, 768, TABLET],
]) {
  test(`${mode}: every screen renders as before`, async (t) => {
    const app = await bootApp({ width, height });
    try {
      assert.deepEqual(app.errors, [], 'no script error while the app starts');
      fresh[`${mode}/start`] = app.snapshot();
      for (const [view, payload] of views) {
        await t.test(view, async () => {
          await app.go(view, payload);
          const key = `${mode}/${view}`;
          fresh[key] = app.snapshot();
          assert.ok(fresh[key].length > 50, `${key} drew something`);
          if (!update) assert.equal(fresh[key], stored[key], `${key} markup changed`);
        });
      }
      fresh[`${mode}/state`] = app.ev('JSON.stringify(state)');
      if (!update) assert.equal(fresh[`${mode}/state`], stored[`${mode}/state`], `${mode} saved state changed`);
      if (!update) assert.equal(fresh[`${mode}/start`], stored[`${mode}/start`], `${mode} first screen changed`);
      // The camera screen sets a few things asynchronously (camera mode, permission): drawn last, after the state check.
      if (mode === 'phone') {
        await t.test('capture', async () => {
          await app.go('capture');
          fresh['phone/capture'] = app.snapshot();
          if (!update) assert.equal(fresh['phone/capture'], stored['phone/capture'], 'phone/capture markup changed');
        });
      }
      assert.deepEqual(app.errors, [], 'no script error on any screen');
    } finally {
      app.close();
    }
  });
}

test.after(() => {
  if (update) fs.writeFileSync(FILE, JSON.stringify(fresh, null, 1) + '\n');
});
