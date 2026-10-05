// Characterization of core.js (local state, account switching, sync entry points, profile bootstrap), run in the real
// app booted in jsdom (helpers/boot-app.mjs). These tests describe what the code does today, including two behaviours
// listed in docs/KNOWN_BUGS.md, so that a refactor cannot change them without notice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, sampleState } from './helpers/boot-app.mjs';

const plain = (x) => JSON.parse(JSON.stringify(x));
const withApp = async (options, fn) => {
  const app = await bootApp(options);
  try {
    await fn(app);
  } finally {
    app.close();
  }
};
const store = (app) => app.win.localStorage;

test('defaultState: three sample courses, each with CM / TD / TP, and the default settings', async () => {
  await withApp({}, (app) => {
    const d = plain(app.ev('defaultState()'));
    assert.equal(d.version, 3);
    assert.equal(d.onboardingComplete, false);
    assert.deepEqual(
      d.courses.map((c) => [c.name, c.color]),
      [
        ['VHDL', '#8C5CF5'],
        ['Mathématiques', '#506BFF'],
        ['Électronique', '#FF9E42'],
      ],
    );
    for (const c of d.courses) {
      assert.deepEqual(
        c.sections.map((s) => [s.name, s.type, s.sortOrder, s.sessions.length]),
        [
          ['CM', 'CM', 0, 0],
          ['TD', 'TD', 1, 0],
          ['TP', 'TP', 2, 0],
        ],
      );
      assert.equal(c.defaultSectionsSeeded, true);
    }
    assert.deepEqual(d.settings, { autoDriveSync: true, drawWithFinger: false });
    assert.equal(d.profile.academicYear, '2026–2027');
    assert.deepEqual([d.inbox, d.files, d.favorites], [[], [], []]);
  });
});

test('loadState: the saved state is read back, missing parts come from the defaults', async () => {
  await withApp({ state: { courses: [], inbox: 'oops', profile: { displayName: 'Léa' } } }, (app) => {
    const s = plain(app.ev('loadState()'));
    assert.equal(s.version, 3);
    assert.deepEqual(s.courses, [], 'a saved empty course list is kept, not replaced by the samples');
    assert.deepEqual(s.inbox, [], 'a field of the wrong type is replaced by an empty list');
    assert.equal(s.profile.displayName, 'Léa');
    assert.equal(s.profile.academicYear, '2026–2027', 'profile fields that were not saved come from the defaults');
    assert.deepEqual(s.settings, { autoDriveSync: true, drawWithFinger: false });
  });
});

test('loadState: unreadable data is backed up and a default state is returned', async () => {
  await withApp({ rawState: '{not json' }, (app) => {
    const key = app.ev('stateKey()');
    const before = Object.keys(store(app)).length;
    const s = plain(app.ev('loadState()'));
    assert.equal(s.courses.length, 3, 'default sample courses');
    const backups = Object.keys(store(app)).filter((k) => k.startsWith(`${key}:backup-`));
    assert.ok(backups.length >= 1, 'a backup key was written');
    assert.equal(store(app).getItem(backups[0]), '{not json');
    assert.ok(Object.keys(store(app)).length > before - 1);
  });
});

test('loadState: a device that only has the pre-account data hands it to the first account', async () => {
  await withApp({ owner: 'user-1', state: null }, (app) => {
    store(app).removeItem('holioo_pwa_state_v3:user-1');
    store(app).setItem('holioo_pwa_state_v3', JSON.stringify({ ...sampleState(), profile: { displayName: 'Ancien' } }));
    assert.equal(plain(app.ev('loadState()')).profile.displayName, 'Ancien');
    store(app).removeItem('holioo_pwa_state_v3');
    store(app).removeItem('holioo_pwa_state_v3:user-1');
    store(app).setItem('holioo_pwa_state_v1', JSON.stringify({ courses: [], profile: { displayName: 'Très ancien' } }));
    assert.equal(plain(app.ev('loadState()')).profile.displayName, 'Très ancien');
  });
});

test('ensureDefaultSections: CM / TD / TP are created once and a deleted one is not brought back', async () => {
  await withApp({}, (app) => {
    const result = plain(
      app.ev(`(()=>{
        const fresh={id:'x',name:'X',sections:[{id:'k',name:'TD',type:'TD',sortOrder:0,sessions:[]}]};
        ensureDefaultSections(fresh);
        const afterFirst=fresh.sections.map(s=>s.name);
        fresh.sections=fresh.sections.filter(s=>s.name!=='TP');
        ensureDefaultSections(fresh);
        const broken={id:'y',name:'Y',defaultSectionsSeeded:true,sections:[{id:'z',name:'CM',sessions:null}]};
        ensureDefaultSections(broken);
        return{afterFirst,afterSecond:fresh.sections.map(s=>s.name),seeded:fresh.defaultSectionsSeeded,sessions:broken.sections[0].sessions}
      })()`),
    );
    assert.deepEqual(result.afterFirst, ['CM', 'TD', 'TP'].sort((a, b) => result.afterFirst.indexOf(a) - result.afterFirst.indexOf(b)));
    assert.equal(result.afterFirst.length, 3);
    assert.deepEqual(result.afterSecond, result.afterFirst.filter((n) => n !== 'TP'));
    assert.equal(result.seeded, true);
    assert.deepEqual(result.sessions, [], 'a missing session list becomes an empty one');
  });
});

test('addCourse: at most 7 courses, each gets the first free icon', async () => {
  await withApp({}, (app) => {
    app.ev(`nextCourseIcon=courses=>'icon-'+courses.length`);
    assert.equal(app.ev('state.courses.length'), 3);
    const added = plain(app.ev(`addCourse('Chimie','#123456')`));
    assert.equal(added.name, 'Chimie');
    assert.equal(added.icon, 'icon-3');
    assert.equal(added.sections.length, 3);
    for (let i = 0; i < 3; i++) app.ev(`addCourse('C${i}','#000000')`);
    assert.equal(app.ev('state.courses.length'), 7);
    assert.equal(app.ev('courseLimitReached()'), true);
    assert.equal(app.ev(`addCourse('Trop','#000000')`), null);
    assert.equal(app.ev('state.courses.length'), 7);
    assert.equal(app.ev('COURSE_LIMIT_MESSAGE'), 'Maximum 7 cours');
  });
});

test('saveState: stored under the owner key; a change in the shared structure stamps lastModified, a setting does not', async () => {
  await withApp({}, (app) => {
    app.ev('state.lastModified=0;saveState()');
    app.ev('state.settings.drawWithFinger=true;saveState()');
    assert.equal(app.ev('state.lastModified'), 0, 'a setting is not shared between devices');
    app.ev(`state.courses[0].name='Renommé';saveState()`);
    assert.equal(app.ev('state.lastModified'), Date.parse('2026-10-05T10:00:00Z'), 'the fixed clock');
    const saved = JSON.parse(store(app).getItem('holioo_pwa_state_v3:guest'));
    assert.equal(saved.courses[0].name, 'Renommé');
    assert.equal(saved.settings.drawWithFinger, true);
    app.ev(`state.lastModified=5;saveState.quiet=true;state.courses[0].name='Silencieux';saveState();saveState.quiet=false`);
    assert.equal(app.ev('state.lastModified'), 5, 'a save made by the sync itself does not claim the change');
  });
});

test('saveState: a full storage shows one warning every ten seconds and never throws', async () => {
  await withApp({}, (app) => {
    app.win.Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    app.ev(`state.courses[0].name='Plein';saveState();saveState()`);
    assert.match(app.win.document.getElementById('toast').textContent, /Stockage plein/);
    assert.equal(app.ev('saveState.warned'), true);
  });
});

test('switchStateOwner: each account has its own local data; test-mode data follows the first account', async () => {
  await withApp({}, (app) => {
    assert.equal(app.ev('guestMode'), true);
    app.ev(`state.profile.displayName='Invité';saveState()`);
    app.ev(`switchStateOwner('user-1')`);
    assert.equal(app.ev('stateOwner'), 'user-1');
    assert.equal(app.ev('guestMode'), false);
    assert.equal(store(app).getItem('holioo_last_uid'), 'user-1');
    assert.equal(app.ev('state.profile.displayName'), 'Invité', 'data made in test mode is inherited once');
    app.ev(`state.profile.displayName='Un';saveState();switchStateOwner('user-2')`);
    assert.equal(app.ev('state.profile.displayName'), 'Étudiant', 'another account starts from the defaults');
    app.ev(`switchStateOwner('user-1')`);
    assert.equal(app.ev('state.profile.displayName'), 'Un');
    assert.equal(store(app).getItem('holioo_pwa_state_v3'), null, 'the pre-account copy is gone once an account owns the data');
    app.ev(`switchStateOwner('')`);
    assert.equal(store(app).getItem('holioo_last_uid'), null);
    assert.equal(app.ev('stateOwner'), '');
    assert.equal(JSON.parse(store(app).getItem('holioo_pwa_state_v3')).profile.displayName, 'Étudiant', 'signed out: a default state under the plain key');
  });
});

test('lookups: course, section, session and the context of a session id', async () => {
  await withApp({}, (app) => {
    app.ev(`currentCourseId='c1';currentSectionId='s1';currentSessionId='${'00000000-0000-4000-8000-000000000002'}'`);
    assert.equal(app.ev('getCourse().name'), 'Analyse');
    assert.equal(app.ev('getSection().name'), 'CM');
    assert.equal(app.ev('getSession().title'), 'CM 2');
    assert.equal(app.ev(`getCourse('nope')`), undefined);
    assert.deepEqual(plain(app.ev(`(c=>c&&[c.course.id,c.section.id,c.session.id])(findSessionContext('00000000-0000-4000-8000-000000000001'))`)), [
      'c1',
      's1',
      '00000000-0000-4000-8000-000000000001',
    ]);
    assert.equal(app.ev(`findSessionContext('missing')`), null);
  });
});

test('small helpers: esc, iconLetter, section class and colour', async () => {
  await withApp({}, (app) => {
    assert.equal(app.ev(`esc('<a href="x">&\\'')`), '&lt;a href=&quot;x&quot;&gt;&amp;&#039;');
    assert.equal(app.ev('esc(null)'), '');
    assert.equal(app.ev(`iconLetter(' maths')`), 'M');
    assert.equal(app.ev('iconLetter("")'), '?');
    assert.deepEqual(plain(app.ev(`['CM','TD','TP','Projet'].map(sectionClass)`)), ['cm', 'td', 'tp', 'custom']);
    assert.deepEqual(plain(app.ev(`['CM','TD','TP','Projet'].map(sectionColor)`)), ['#506BFF', '#8C5CF5', '#FF9E42', '#29ADB5']);
    assert.equal(app.ev(`fmtDate('2026-10-05T10:00:00Z')`), '05 oct. 2026');
    assert.equal(app.ev(`fmtDate('not a date')`), 'Invalid Date');
  });
});

test('sheets: openSheet mounts one sheet, the confirm button runs the action and closes it', async () => {
  await withApp({}, async (app) => {
    app.ev(`window.__calls=[];openSheet({title:'Titre <b>',subtitle:'Sous',body:'<p id="in">corps</p>',confirmText:'Valider',onConfirm:()=>{window.__calls.push('ok')}})`);
    const root = app.win.document.getElementById('sheetRoot');
    assert.match(root.innerHTML, /Titre &lt;b&gt;/);
    assert.ok(root.querySelector('#in'));
    root.querySelector('#sheetConfirm').click();
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(plain(app.win.__calls), ['ok']);
    assert.equal(root.innerHTML, '', 'closed after the action');
    app.ev(`openSheet({title:'T',onConfirm:()=>false})`);
    root.querySelector('#sheetConfirm').click();
    await new Promise((r) => setTimeout(r, 10));
    assert.notEqual(root.innerHTML, '', 'an action that returns false keeps the sheet open');
    root.querySelector('#sheetCancel').click();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(root.innerHTML, '');
  });
});

test('profilePayload: what is sent to the profiles table', async () => {
  await withApp({}, (app) => {
    app.ev(`currentUser={id:'u-1'}`);
    const p = plain(app.ev('profilePayload()'));
    assert.deepEqual(Object.keys(p).sort(), [
      'academic_year', 'avatar_url', 'display_name', 'faculty', 'holioo_id', 'id', 'is_public', 'level', 'name',
      'program', 'public_profile', 'semester', 'university', 'user_id',
    ]);
    assert.equal(p.id, 'u-1');
    assert.equal(p.holioo_id, 'h123');
    assert.equal(p.university, 'Sorbonne');
    assert.equal(p.faculty, null, 'empty fields are sent as null');
  });
});

// ---- runDriveSync / queueSync ----

const syncApp = (app, result = {}, status = { connected: true, email: 'a@b.c' }) => {
  app.ev(`window.__syncCalls=0;window.__toasts=[];
    showToast=m=>window.__toasts.push(m);window.__renders=0;render=async()=>{window.__renders++};
    sb={};currentUser={id:'u1'};guestMode=false;
    Drive.status=async()=>(${JSON.stringify(status)});
    Drive.pendingCount=async()=>0;
    Drive.syncAll=async o=>{window.__syncCalls++;return ${JSON.stringify({ synced: 0, failed: 0, received: 0, ...result })}};`);
};
const toasts = (app) => plain(app.win.__toasts);

test('runDriveSync: does nothing offline, signed out, or with automatic sync off (except a manual tap)', async () => {
  await withApp({}, async (app) => {
    syncApp(app);
    app.ev(`currentUser=null`);
    await app.ev(`runDriveSync('manual')`);
    assert.equal(app.win.__syncCalls, 0, 'signed out');
    app.ev(`currentUser={id:'u1'};state.settings.autoDriveSync=false`);
    await app.ev(`runDriveSync('auto')`);
    assert.equal(app.win.__syncCalls, 0, 'automatic sync off');
    await app.ev(`runDriveSync('manual')`);
    assert.equal(app.win.__syncCalls, 1, 'a manual tap always syncs');
    assert.deepEqual(toasts(app), ['Tout est déjà synchronisé']);
  });
});

test('runDriveSync: the toast says what happened', async () => {
  const cases = [
    [{ synced: 2 }, '2 élément(s) synchronisé(s)'],
    [{ received: 3 }, '3 élément(s) reçu(s) de vos autres appareils'],
    [{ failed: 1, lastError: new Error('x') }, '1 élément(s) non synchronisé(s) — nouvel essai plus tard'],
    [{ receivedFailed: 2 }, '2 élément(s) de vos autres appareils n’ont pas pu être reçus — nouvel essai plus tard'],
    [{ changed: true }, 'Vos autres appareils sont à jour ici'],
  ];
  for (const [result, message] of cases) {
    await withApp({}, async (app) => {
      syncApp(app, result);
      await app.ev(`runDriveSync('manual')`);
      assert.deepEqual(toasts(app), [message]);
      assert.equal(app.win.__renders > 0, Boolean(result.received || result.changed), 'the screen is drawn again only when other devices changed something');
    });
  }
});

test('runDriveSync: Drive not connected, Drive full, and other errors', async () => {
  await withApp({}, async (app) => {
    syncApp(app, {}, { connected: false });
    await app.ev(`runDriveSync('manual')`);
    assert.equal(app.win.__syncCalls, 0);
    assert.deepEqual(toasts(app), ['Connectez Google Drive d’abord']);
    await app.ev(`runDriveSync('auto')`);
    assert.equal(toasts(app).length, 1, 'silent when it was not a manual tap');
  });
  await withApp({}, async (app) => {
    syncApp(app);
    app.ev(`Drive.syncAll=async()=>{const e=new Error('full');e.code='DRIVE_FULL';throw e}`);
    await app.ev(`runDriveSync('auto')`);
    assert.deepEqual(toasts(app), ['Google Drive est plein : libérez de l’espace pour continuer la sauvegarde']);
    assert.equal(app.ev('syncBusy'), false);
  });
  await withApp({}, async (app) => {
    syncApp(app);
    app.ev(`Drive.syncAll=async()=>{throw new Error('boom')}`);
    await app.ev(`runDriveSync('manual')`);
    assert.deepEqual(toasts(app), ['Sync impossible : boom']);
    assert.equal(app.ev('syncBusy'), false, 'the busy flag is always released');
  });
});

test('runDriveSync: a change made during a sync is sent by one more run right after it', async () => {
  await withApp({}, async (app) => {
    syncApp(app);
    app.ev(`Drive.syncAll=async()=>{window.__syncCalls++;if(window.__syncCalls===1){runDriveSync('auto')}return{synced:0,failed:0,received:0}}`);
    await app.ev(`runDriveSync('manual')`);
    await new Promise((r) => setTimeout(r, 800));
    assert.equal(app.win.__syncCalls, 2);
  });
});

// ---- bootstrapCloud (sign-in state and profile) ----

const supabaseStub = ({ session = null, profile = null, error = null } = {}) => `
  window.__calls=[];
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:${JSON.stringify(session)}}}),setSession:async()=>({}),signOut:async()=>{window.__calls.push('signOut')}},
    from:t=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:${JSON.stringify(profile)},error:${JSON.stringify(error)}})})}),
              insert:async r=>{window.__calls.push(['insert',t,r.holioo_id]);return{}},upsert:async()=>({})}),
    channel:()=>({on(){return this},subscribe(){return this}}),
    functions:{invoke:async()=>({data:{}})}})};
  sb=null;libraryChannel=null;`;

test('bootstrapCloud: no session → stays local; a signed-in profile is merged into the state', async () => {
  await withApp({}, async (app) => {
    app.ev(supabaseStub({ session: null }));
    await app.ev('bootstrapCloud()');
    assert.equal(app.ev('currentUser'), null);
    assert.equal(app.ev('cloudReady'), false);
  });
  await withApp({ owner: 'u-9', state: sampleState() }, async (app) => {
    app.ev(`guestMode=false;stateOwner='u-9';startSyncSignals=undefined`);
    app.ev(
      supabaseStub({
        session: { user: { id: 'u-9', email: 'e@x.y' } },
        profile: { id: 'u-9', name: 'Server Name', holioo_id: 'hserver', role: 'admin', blocked: false, university: 'Paris', public_profile: true },
      }),
    );
    await app.ev('bootstrapCloud()');
    assert.equal(app.ev('cloudReady'), true);
    assert.equal(app.ev('currentRole'), 'admin');
    assert.equal(app.ev('accountBlocked'), false);
    assert.equal(app.ev('state.profile.displayName'), 'Server Name');
    assert.equal(app.ev('state.profile.holiooId'), 'hserver');
    assert.equal(app.ev('state.profile.university'), 'Paris');
    assert.equal(app.ev('state.profile.publicProfile'), true);
    assert.equal(app.ev('state.profile.email'), 'e@x.y');
  });
});

test('bootstrapCloud: a blocked account is flagged and nothing else starts', async () => {
  await withApp({ owner: 'u-9' }, async (app) => {
    app.ev(`guestMode=false;stateOwner='u-9';window.__started=false;startSyncSignals=()=>{window.__started=true}`);
    app.ev(supabaseStub({ session: { user: { id: 'u-9' } }, profile: { id: 'u-9', blocked: true } }));
    await app.ev('bootstrapCloud()');
    assert.equal(app.ev('accountBlocked'), true);
    assert.equal(app.win.__started, false);
  });
});

test('bootstrapCloud: an authentication error signs out; a missing profile creates one', async () => {
  await withApp({ owner: 'u-9' }, async (app) => {
    app.ev(`guestMode=false;stateOwner='u-9'`);
    app.ev(supabaseStub({ session: { user: { id: 'u-9' } }, error: { message: 'JWT expired' } }));
    await app.ev('bootstrapCloud()');
    assert.ok(plain(app.win.__calls).includes('signOut'));
    assert.equal(app.ev('currentUser'), null);
    assert.equal(app.ev('currentView'), 'login');
  });
  await withApp({ owner: 'u-9' }, async (app) => {
    app.ev(`guestMode=false;stateOwner='u-9';startSyncSignals=undefined`);
    app.ev(supabaseStub({ session: { user: { id: 'u-9' } }, profile: null }));
    await app.ev('bootstrapCloud()');
    assert.equal(app.ev('state.profile.holiooId'), 'hu9');
    assert.deepEqual(plain(app.win.__calls).filter((c) => Array.isArray(c)), [['insert', 'profiles', 'hu9']]);
  });
});

test('bootstrapCloud (known behaviour, docs/KNOWN_BUGS.md #4): a profile query error that is not an auth error is treated as "no profile"', async () => {
  await withApp({ owner: 'u-9' }, async (app) => {
    app.ev(`guestMode=false;stateOwner='u-9';startSyncSignals=undefined`);
    app.ev(supabaseStub({ session: { user: { id: 'u-9' } }, profile: null, error: { message: 'network blip' } }));
    await app.ev('bootstrapCloud()');
    assert.equal(app.ev('state.profile.holiooId'), 'hu9', 'a new ID is generated locally');
    assert.equal(plain(app.win.__calls).filter((c) => Array.isArray(c)).length, 1, 'and an insert is attempted');
  });
});

test('bootstrapCloud: offline after sign-in, the account is known but the cloud is not asked', async () => {
  await withApp({ owner: 'u-9' }, async (app) => {
    app.ev(`guestMode=false;stateOwner='u-9'`);
    app.ev(supabaseStub({ session: { user: { id: 'u-9' } }, profile: { id: 'u-9' } }));
    Object.defineProperty(app.win.navigator, 'onLine', { configurable: true, value: false });
    await app.ev('bootstrapCloud()');
    assert.equal(app.ev('currentUser.id'), 'u-9');
    assert.equal(app.ev('cloudReady'), false);
  });
});

test('signOut and enterGuestMode switch the local data owner and the screen', async () => {
  await withApp({}, async (app) => {
    app.ev(supabaseStub({ session: null }));
    app.ev(`sb=window.supabase.createClient();currentUser={id:'u1'};cloudReady=true;stopRemoteSync=()=>{window.__stopped=true};render=async()=>{}`);
    await app.ev('signOut()');
    assert.equal(app.win.__stopped, true);
    assert.equal(app.ev('currentUser'), null);
    assert.equal(app.ev('stateOwner'), '');
    assert.equal(app.ev('currentView'), 'login');
    app.ev('enterGuestMode()');
    assert.equal(app.ev('guestMode'), true);
    assert.equal(app.ev('stateOwner'), 'guest');
  });
});

test('navigate: bare screens hide the chrome, the camera is released when leaving it, ids are remembered', async () => {
  await withApp({}, async (app) => {
    await app.go('course', { courseId: 'c2' });
    assert.equal(app.ev('currentView'), 'course');
    assert.equal(app.ev('currentCourseId'), 'c2');
    assert.equal(app.win.document.getElementById('appShell').classList.contains('hidden-chrome'), false);
    await app.go('academicSetup');
    assert.equal(app.ev('currentView'), 'academicSetup');
    assert.equal(app.win.document.getElementById('appShell').classList.contains('hidden-chrome'), true);
    await app.go('admin');
    assert.equal(app.ev('currentView'), 'profile', 'only an admin account reaches the admin screen');
  });
});
