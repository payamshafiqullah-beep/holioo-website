// Finds an app script by its file name, wherever it lives under pwa/ (so a test does not depend on the folder layout).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PWA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let index = null;

function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'tests' && entry.name !== 'node_modules') scan(full);
    } else if (!index.has(entry.name)) index.set(entry.name, full);
    else index.set(entry.name, null); // two files with the same name: ambiguous
  }
}

/** Absolute path of the app file called `name` (e.g. 'canvas-doc.js'). */
export function appFile(name) {
  if (!index) {
    index = new Map();
    scan(PWA);
  }
  const found = index.get(name);
  if (!found) throw new Error(found === null ? `Several app files are called ${name}` : `No app file called ${name}`);
  return found;
}

export const readAppFile = (name) => fs.readFileSync(appFile(name), 'utf8');

/** The Drive layer is several scripts (sync/drive-*.js) that load one after the other: their text, in load order. */
export const driveSource = () => ['drive-api.js', 'drive-items.js', 'drive-cloud.js'].map(readAppFile).join('');
