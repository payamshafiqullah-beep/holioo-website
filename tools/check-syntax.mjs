// Syntax check of every classic script of the app (pwa/**/*.js, tests excluded): a file that does not parse fails the build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = new URL('../pwa/', import.meta.url);
let checked = 0;
let failed = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'tests' && entry.name !== 'node_modules') walk(full);
    } else if (entry.name.endsWith('.js')) {
      checked++;
      try {
        new vm.Script(fs.readFileSync(full, 'utf8'), { filename: full });
      } catch (error) {
        failed++;
        console.error(`${path.relative(process.cwd(), full)}: ${error.message}`);
      }
    }
  }
}

walk(fileURLToPath(root));
console.log(`Syntax: ${checked - failed}/${checked} files OK`);
process.exit(failed ? 1 : 0);
