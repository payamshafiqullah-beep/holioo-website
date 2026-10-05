// Checks that what is published is exactly what is in pwa/.
//
//   node tools/verify-deploy.mjs dist/app                       the build output (before publishing)
//   node tools/verify-deploy.mjs https://www.holioo.fr/app/     the live site (after publishing)
//
// Every app file of pwa/ (everything except tests/ and smoke-test.mjs) must be there with the same bytes, and nothing
// of the tests may be published. Line endings are ignored (the repository stores LF; a Windows checkout may not).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pwa = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../pwa');
const target = process.argv[2];
if (!target) {
  console.error('usage: node tools/verify-deploy.mjs <dist/app | https://site/app/>');
  process.exit(2);
}
const live = /^https?:\/\//.test(target);
const NOT_PUBLISHED = (rel) => rel.startsWith('tests/') || rel === 'smoke-test.mjs';

const hash = (bytes) => {
  const text = /\.(js|css|html|svg|json|webmanifest|md)$/.test(bytes.name)
    ? Buffer.from(bytes.data.toString('utf8').replace(/\r\n/g, '\n'))
    : bytes.data;
  return crypto.createHash('sha256').update(text).digest('hex');
};

function* localFiles(dir, base = dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* localFiles(full, base);
    else yield path.relative(base, full).split(path.sep).join('/');
  }
}

const expected = [...localFiles(pwa)].filter((rel) => !NOT_PUBLISHED(rel));
const problems = [];

async function fetchLive(rel) {
  const url = new URL(rel, target.endsWith('/') ? target : `${target}/`);
  url.searchParams.set('verify', String(Date.now()));
  const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

let checked = 0;
const queue = [...expected];
const worker = async () => {
  while (queue.length) {
    const rel = queue.pop();
    const local = fs.readFileSync(path.join(pwa, rel));
    const remote = live
      ? await fetchLive(rel)
      : fs.existsSync(path.join(target, rel))
        ? fs.readFileSync(path.join(target, rel))
        : null;
    checked++;
    if (!remote) problems.push(`missing: ${rel}`);
    else if (hash({ name: rel, data: local }) !== hash({ name: rel, data: remote })) problems.push(`different: ${rel}`);
  }
};
await Promise.all(Array.from({ length: live ? 8 : 1 }, worker));

// the tests must not be published
for (const probe of ['tests/camera-destination.test.mjs', 'smoke-test.mjs']) {
  const found = live ? (await fetchLive(probe)) !== null : fs.existsSync(path.join(target, probe));
  if (found) problems.push(`must not be published: ${probe}`);
}
if (!live) {
  const published = [...localFiles(target)];
  for (const rel of published) if (!expected.includes(rel)) problems.push(`not in pwa/: ${rel}`);
}

if (problems.length) {
  console.error(`${target}: ${problems.length} problem(s)\n  ${problems.sort().join('\n  ')}`);
  process.exit(1);
}
console.log(`${target}: ${checked} app files are identical to pwa/, and no test is published.`);
