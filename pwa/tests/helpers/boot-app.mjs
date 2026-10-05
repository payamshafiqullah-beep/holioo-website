// Boots the real app (the scripts of index.html, in their load order) inside jsdom, in guest mode, with a fake
// IndexedDB and a fixed clock, so tests can render screens and drive the app's own functions.
// It reads the script list from index.html: moving or splitting files never needs a change here.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { fakeDb } from './fake-drive.mjs';

const PWA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FIXED_NOW = Date.parse('2026-10-05T10:00:00Z');

export const scriptFiles = () => {
  const html = fs.readFileSync(path.join(PWA, 'index.html'), 'utf8');
  return [...html.matchAll(/<script[^>]*\ssrc="\.\/([^"?]+)/g)].map((m) => m[1]);
};

const sect = (id, name, sortOrder, sessions = []) => ({ id, name, type: name, sortOrder, sessions });
const sess = (id, number, title, photoIds = []) => ({ id, number, title, photoIds, createdAt: '2026-10-01T09:00:00.000Z' });
export const SESSION_1 = '00000000-0000-4000-8000-000000000001';
export const SESSION_2 = '00000000-0000-4000-8000-000000000002';

/** A small, fixed account: three courses, two séances in Analyse / CM. */
export const sampleState = () => ({
  version: 3,
  onboardingComplete: true,
  academicSetupSeen: true,
  profile: {
    displayName: 'Étudiant',
    holiooId: 'h123',
    avatarUrl: '',
    university: 'Sorbonne',
    faculty: '',
    program: '',
    level: 'L2',
    semester: 'S1',
    academicYear: '2026–2027',
    publicProfile: false,
  },
  courses: [
    {
      id: 'c1',
      name: 'Analyse',
      color: '#506BFF',
      defaultSectionsSeeded: true,
      sections: [
        sect('s1', 'CM', 0, [sess(SESSION_1, 1, 'CM 1'), sess(SESSION_2, 2, 'CM 2')]),
        sect('s2', 'TD', 1),
        sect('s3', 'TP', 2),
      ],
    },
    {
      id: 'c2',
      name: 'VHDL',
      color: '#8C5CF5',
      defaultSectionsSeeded: true,
      sections: [sect('s4', 'CM', 0), sect('s5', 'TD', 1), sect('s6', 'TP', 2)],
    },
    {
      id: 'c3',
      name: 'Électronique',
      color: '#FF9E42',
      defaultSectionsSeeded: true,
      sections: [sect('s7', 'CM', 0), sect('s8', 'TD', 1), sect('s9', 'TP', 2)],
    },
  ],
  inbox: [],
  files: [],
  favorites: [],
  settings: { autoDriveSync: true, drawWithFinger: false },
});

const mediaMatches = (query, { width, touch }) => {
  const min = /min-width:\s*(\d+)px/.exec(query);
  const max = /max-width:\s*(\d+)px/.exec(query);
  if (min && width < Number(min[1])) return false;
  if (max && width > Number(max[1])) return false;
  if (min || max) return true;
  if (/pointer:\s*coarse|hover:\s*none/.test(query)) return touch;
  if (/prefers-reduced-motion:\s*reduce/.test(query)) return true;
  return false;
};

const waitFor = async (check, label, ms = 5000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 5));
  }
};

/**
 * @param {object} options
 * @param {number} [options.width] window width in px (≥ 768 = tablet / computer layout)
 * @param {object|null} [options.state] the saved local state (default: sampleState())
 * @param {string|null} [options.rawState] the saved state as stored text (to test unreadable data); wins over `state`
 * @param {string} [options.owner] the account the local data belongs to ('guest' = test mode)
 * @param {boolean} [options.touch]
 */
export async function bootApp({ width = 390, height = 844, state = sampleState(), rawState = null, owner = 'guest', touch = true } = {}) {
  const html = fs
    .readFileSync(path.join(PWA, 'index.html'), 'utf8')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<link[^>]*>/g, '');
  const dom = new JSDOM(html, { url: 'http://localhost:8080/', runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  const errors = [];
  const db = fakeDb();
  Object.assign(db, {
    open: async () => {},
    keys: async (store) => [...db.stores[store].keys()],
    blobUrl: async (store, key) => (db.stores[store].get(key)?.blob ? 'blob:fake' : ''),
  });

  win.localStorage.setItem('holioo_last_uid', owner);
  if (rawState !== null) win.localStorage.setItem(`holioo_pwa_state_v3:${owner}`, rawState);
  else if (state) win.localStorage.setItem(`holioo_pwa_state_v3:${owner}`, JSON.stringify(state));
  win.localStorage.setItem('holioo_device_id', '11111111-1111-4111-8111-111111111111');

  const noop = () => {};
  let uuidCounter = 0;
  Object.defineProperty(win, 'crypto', {
    configurable: true,
    value: {
      randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '1')}`,
      getRandomValues: (a) => a,
    },
  });
  Object.defineProperty(win, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(win, 'innerHeight', { configurable: true, value: height });
  Object.defineProperty(win.navigator, 'maxTouchPoints', { configurable: true, value: touch ? 5 : 0 });
  win.matchMedia = (query) => ({
    matches: mediaMatches(query, { width, touch }),
    media: query,
    addEventListener: noop,
    removeEventListener: noop,
    addListener: noop,
    removeListener: noop,
  });
  win.scrollTo = noop;
  win.Element.prototype.scrollIntoView = noop;
  win.Element.prototype.scrollBy = noop;
  win.Element.prototype.scrollTo = noop;
  win.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  win.IntersectionObserver = win.ResizeObserver;
  win.URL.createObjectURL = () => 'blob:fake';
  win.URL.revokeObjectURL = noop;
  win.fetch = async () => {
    throw new Error('offline');
  };
  const ctx2d = new Proxy(
    {},
    {
      get: (target, key) => {
        if (key === 'measureText') return (text) => ({ width: String(text).length * 6 });
        if (key in target) return target[key];
        return noop;
      },
      set: (target, key, value) => ((target[key] = value), true),
    },
  );
  win.HTMLCanvasElement.prototype.getContext = () => ctx2d;
  win.HoliooDB = db;

  const context = dom.getInternalVMContext();
  const run = (code, filename = 'inline.js') => new vm.Script(code, { filename }).runInContext(context);
  run(`(()=>{const R=Date,F=${FIXED_NOW};
    globalThis.Date=class extends R{constructor(...a){a.length?super(...a):super(F)}static now(){return F}}})()`);
  win.addEventListener('error', (e) => errors.push(e.message));
  for (const file of scriptFiles()) {
    if (file === 'db.js') continue; // replaced by the fake database above
    try {
      run(fs.readFileSync(path.join(PWA, file), 'utf8'), file);
    } catch (error) {
      errors.push(`${file}: ${error.message}`);
    }
  }
  await waitFor(() => win.document.getElementById('app').children.length > 0, 'the first screen');
  await new Promise((r) => setTimeout(r, 20));

  const app = {
    win,
    db,
    errors,
    /** Evaluates code in the app's global scope (top-level let / const included). */
    ev: (code) => run(code),
    /** Goes to a screen like a tap would and waits for it to be drawn. */
    async go(view, payload = {}) {
      run(`navigate(${JSON.stringify(view)},${JSON.stringify(payload)})`);
      await new Promise((r) => setTimeout(r, 30));
      await run('render()');
    },
    /** What the user sees: the shell classes, the bottom menu, the toolbar of the desk layout and the screen. */
    snapshot: () => {
      const d = win.document;
      const pick = (sel) => d.querySelector(sel)?.outerHTML ?? '';
      return [
        `<shell class="${d.getElementById('appShell').className}">`,
        pick('#bottomNav'),
        pick('#deskBar'),
        d.getElementById('app').innerHTML,
        d.getElementById('sheetRoot').innerHTML,
      ].join('\n');
    },
    close: () => win.close(),
  };
  return app;
}
