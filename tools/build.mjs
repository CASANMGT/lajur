/** Static build output for Vercel: copy the app shell, assets and ES modules. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const copy = (name) => {
  const from = path.join(root, name);
  const to = path.join(out, name);
  if (!fs.existsSync(from)) return;
  fs.cpSync(from, to, { recursive: true });
};

copy('index.html');
copy('assets');
copy('src');

const files = fs.readdirSync(out, { recursive: true }).length;
console.log(`Static build ready: public/ (${files} entries)`);
