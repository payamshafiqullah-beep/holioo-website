// More characterization of drive.js: file-name cleaning, the per-account folder cache, adopting a document read from
// another device. Complements drive-sync.test.mjs (sync behaviour) and cloud-sync-drive.test.mjs (two devices).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { driveSource } from './helpers/app-files.mjs';
import { fakeDrive, fakeDb } from './helpers/fake-drive.mjs';

const code = driveSource();

function load(drive) {
  const storage = new Map();
  const window = {};
  const ctx = {
    window,
    fetch: drive.fetch,
    Headers,
    Blob,
    Response,
    TextEncoder,
    URL,
    URLSearchParams,
    navigator: { onLine: true },
    console,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
  };
  vm.runInNewContext(code, ctx);
  return { D: window.HoliooDrive, storage };
}
const sb = {
  functions: { invoke: async () => ({ data: { access_token: 'token' } }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { connected: true, email: 'x@y.z' } }) }) }) }),
};
const stateWith = (names) => ({
  profile: { academicYear: '2026–2027' },
  inbox: [],
  files: [],
  courses: [{ name: 'Analyse', sections: [{ name: 'CM', sessions: [{ id: 's1', title: 'CM 1', photoIds: names }] }] }],
});
const dbWithPhotos = (ids) => {
  const db = fakeDb();
  for (const id of ids) db.stores.photos.set(id, { id, blob: new Blob(['x' + id], { type: 'image/jpeg' }), syncState: 'pending' });
  return db;
};

test('safeName: characters Drive or the file system dislike become "-", an empty name becomes "Sans titre"', () => {
  const { D } = load(fakeDrive());
  assert.equal(D.safeName('a/b\\c:d*e?f"g<h>i|j'), 'a-b-c-d-e-f-g-h-i-j');
  assert.equal(D.safeName('  Cours  '), 'Cours');
  assert.equal(D.safeName(''), 'Sans titre');
  assert.equal(D.safeName(null), 'Sans titre');
  assert.equal(D.safeName('   '), 'Sans titre');
});

test('the folder cache is kept per account: two accounts on one device never share folder ids', async () => {
  const drive = fakeDrive();
  const { D, storage } = load(drive);
  const ids = ['photo-0-aaaaaaaa'];
  await D.syncAll({ sb, user: { id: 'u1' }, state: stateWith(ids), db: dbWithPhotos(ids) });
  assert.ok(storage.has('holioo_drive_folder_cache:u1'));
  assert.ok(Object.keys(JSON.parse(storage.get('holioo_drive_folder_cache:u1'))).length >= 4, 'Holioo / year / course / section / séance');
  await D.syncAll({ sb, user: { id: 'u2' }, state: stateWith(ids), db: dbWithPhotos(ids) });
  assert.ok(storage.has('holioo_drive_folder_cache:u2'));
  assert.equal(storage.has('holioo_drive_folder_cache'), false, 'the old shared cache key is removed');
});

test('adoptDocument remembers a document read from Drive as already sent (so it is replaced in place, never duplicated)', async () => {
  const { D } = load(fakeDrive());
  const db = fakeDb();
  await D.adoptDocument(db, { id: 'notes:s1', version: 7, folder: ['Analyse', 'CM', 'CM 1'] }, '2026–2027', {
    'Notes.json': { id: 'f1', parentId: 'p1', sig: 'abc' },
  });
  assert.deepEqual(db.stores.kv.get('drive:notes:s1'), {
    key: 'drive:notes:s1',
    meta: { version: 7, path: 'Holioo/2026–2027/Analyse/CM/CM 1', files: { 'Notes.json': { id: 'f1', parentId: 'p1', sig: 'abc' } } },
  });
});

test('pendingCount: photos without a Drive id, photos edited since, and what is still to fetch from the account', async () => {
  const { D } = load(fakeDrive());
  const db = dbWithPhotos(['a', 'b', 'c']);
  db.stores.photos.get('b').driveFileId = 'f-b';
  db.stores.photos.get('c').driveFileId = 'f-c';
  db.stores.photos.get('c').driveNeedsUpdate = true;
  const state = stateWith(['a', 'b', 'c']);
  state.cloud = { pending: ['x', 'y'], pendingPdfs: ['p'] };
  assert.equal(await D.pendingCount(state, db), 2 + 3, 'a (new) + c (edited) + 3 to fetch');
});
