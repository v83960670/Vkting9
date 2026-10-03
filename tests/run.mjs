/**
 * ESCAPE 99 — test runner
 *   node tests/run.mjs
 * Runs the data validation, the solvability bots and the systems tests.
 */
import { results } from './harness.mjs';

const t0 = Date.now();
console.log('\n\x1b[1m\x1b[33mESCAPE 99\x1b[0m — 99 rooms. one way out.\n');
console.log('running room, mechanic and systems tests…');

await import('./rooms.test.mjs');
await import('./systems.test.mjs');

const ms = Date.now() - t0;
console.log(`\n\x1b[1m${results.pass} passed, ${results.fail} failed\x1b[0m in ${(ms / 1000).toFixed(2)}s\n`);
if (results.fail) {
  console.log('failures:');
  for (const f of results.failures) console.log(`  ✗ ${f.name}\n    ${f.err.stack?.split('\n').slice(0, 3).join('\n    ')}`);
  process.exit(1);
}
process.exit(0);
