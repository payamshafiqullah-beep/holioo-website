// The PWA is a set of classic <script> files that share one global scope (see pwa/ARCHITECTURE.md).
// ESLint needs to know every name one file declares at the top level for the others: this collects them.
import fs from 'node:fs';
import path from 'node:path';
import * as espree from 'espree';

const SKIP_DIRS = new Set(['tests', 'vendor', 'node_modules']);
const isWorker = (file) => file.endsWith('-worker.js'); // worker scripts have their own global scope

// Libraries loaded on demand from a CDN, and CommonJS-style exports of files that are also tested in Node.
const EXTERNAL = { Tesseract: 'readonly', module: 'writable' };

// Modules that publish themselves on the global object: root.Name = …, window.Name = …, self.Name = …
const PUBLISHED = /\b(?:root|window|self|globalThis)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g;

function* appScripts(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* appScripts(full);
    } else if (entry.name.endsWith('.js') && entry.name !== 'sw.js' && !isWorker(entry.name)) {
      yield full;
    }
  }
}

function topLevelNames(code) {
  const names = [];
  const ast = espree.parse(code, { ecmaVersion: 'latest', sourceType: 'script' });
  const fromPattern = (p) => {
    if (!p) return;
    if (p.type === 'Identifier') names.push(p.name);
    else if (p.type === 'ObjectPattern') p.properties.forEach((x) => fromPattern(x.value ?? x.argument));
    else if (p.type === 'ArrayPattern') p.elements.forEach(fromPattern);
    else if (p.type === 'AssignmentPattern') fromPattern(p.left);
    else if (p.type === 'RestElement') fromPattern(p.argument);
  };
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') names.push(node.id.name);
    else if (node.type === 'VariableDeclaration') node.declarations.forEach((d) => fromPattern(d.id));
  }
  return names;
}

/** { name: 'writable' } for every global the app scripts declare or publish for each other. */
export function scriptGlobals(pwaDir) {
  const out = { ...EXTERNAL };
  const vendorDir = path.join(pwaDir, 'vendor');
  const vendor = fs.existsSync(vendorDir) ? fs.readdirSync(vendorDir).map((f) => path.join(vendorDir, f)) : [];
  for (const file of [...appScripts(pwaDir), ...vendor]) {
    const code = fs.readFileSync(file, 'utf8');
    if (!vendor.includes(file)) for (const name of topLevelNames(code)) out[name] = 'writable';
    for (const match of code.matchAll(PUBLISHED)) out[match[1]] = 'writable';
  }
  return out;
}
