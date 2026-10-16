// Genera remote/demo-deck.json: el deck de ejemplo tal como lo recibe el celular.
// Lo usa el modo demostración del control (?demo), las capturas de la tienda y las pruebas.
//
//   node scripts/demo-deck.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileDeck, defaultDeck } from '../extension/deck.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(ROOT, 'remote', 'demo-deck.json');
fs.writeFileSync(out, `${JSON.stringify(compileDeck(defaultDeck()))}\n`);
console.log('  ', path.relative(ROOT, out));
