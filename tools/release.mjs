// One release version for the whole app.
//
// pwa/release.json holds it. This script writes it everywhere it has to appear, so the files can never disagree:
//   - pwa/index.html: the ?v=<release> token of every script and style sheet (the service worker serves versioned URLs
//     cache-first, so a new token is what makes installed apps load the new files);
//   - pwa/sw.js: RELEASE, the cache name (holioo-<release>: an old release's cache is deleted when the new one
//     activates) and CORE, the list of files cached for offline use, read from index.html (plus the worker files).
//
//   node tools/release.mjs 20261101-epure-v43   sets a new release and rewrites the files
//   node tools/release.mjs                       rewrites the files from the current release.json
//   node tools/release.mjs --check               changes nothing; fails when a file disagrees (used by CI)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pwa = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../pwa');
const file = (name) => path.join(pwa, name);
const check = process.argv.includes('--check');
const newRelease = process.argv.slice(2).find((a) => !a.startsWith('--'));

const config = JSON.parse(fs.readFileSync(file('release.json'), 'utf8'));
if (newRelease) config.release = newRelease;
const { release, extraFiles = [] } = config;
if (!/^[\w.-]+$/.test(release)) throw new Error(`Bad release name: ${release}`);

// ---- index.html: every local script / style sheet carries ?v=<release>
const versioned = /(<(?:script src|link rel="stylesheet" href)=")(\.\/[^"?]+)\?v=[^"]*(")/g;
const html = fs.readFileSync(file('index.html'), 'utf8');
const stampedHtml = html.replace(versioned, `$1$2?v=${release}$3`);

// ---- sw.js: RELEASE, VERSION and CORE
const urls = [...stampedHtml.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !u.startsWith('./manifest'));
const core = ['./', './index.html', ...urls, ...extraFiles.map((f) => `./${f}?v=${release}`), './manifest.webmanifest'];
const unique = [...new Set(core)];
const block = [
  '// release:begin — written by tools/release.mjs from pwa/release.json and pwa/index.html; do not edit by hand',
  `const RELEASE='${release}';`,
  'const VERSION=`holioo-${RELEASE}`;',
  `const CORE=${JSON.stringify(unique).replace(/","/g, '", "')};`,
  '// release:end',
].join('\n');
const sw = fs.readFileSync(file('sw.js'), 'utf8');
const marker = /\/\/ release:begin[\s\S]*?\/\/ release:end/;
if (!marker.test(sw)) throw new Error('sw.js has no release:begin … release:end block');
const stampedSw = sw.replace(marker, block);

// ---- every cached file must exist
const missing = unique
  .map((u) => u.replace(/^\.\//, '').split('?')[0] || 'index.html')
  .filter((p) => !fs.existsSync(file(p)));
if (missing.length) throw new Error(`Cached files that do not exist: ${missing.join(', ')}`);

if (check) {
  const problems = [];
  if (html !== stampedHtml) problems.push('pwa/index.html: a ?v= token is not the release');
  if (sw !== stampedSw) problems.push('pwa/sw.js: RELEASE / VERSION / CORE do not match release.json and index.html');
  if (problems.length) {
    console.error(
      `Release ${release} is not applied consistently:\n  ${problems.join('\n  ')}\nRun: node tools/release.mjs`,
    );
    process.exit(1);
  }
  console.log(`Release ${release}: index.html and sw.js agree (${unique.length} cached files).`);
} else {
  fs.writeFileSync(file('release.json'), JSON.stringify(config, null, 2) + '\n');
  fs.writeFileSync(file('index.html'), stampedHtml);
  fs.writeFileSync(file('sw.js'), stampedSw);
  console.log(`Release ${release} written to index.html and sw.js (${unique.length} cached files).`);
}
