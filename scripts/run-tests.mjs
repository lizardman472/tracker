// Unified runner for the legacy calculation/render tests.
//
// The three test files predate any build step and are run individually as
// `node tests/<file>.js`. Two of them (hex, render.smoke) print a
// "N passed, M failed" line but always exit 0, so chaining them with `&&`
// would not catch a regression. This runner spawns each, echoes its output,
// and exits non-zero if any test process fails OR reports a non-zero failure
// count — without modifying the test files themselves.
import { spawnSync } from 'node:child_process';

const files = [
  'tests/calc.test.js',
  'tests/hex.test.js',
  'tests/render.smoke.js',
];

let failures = 0;
for (const file of files) {
  const r = spawnSync('node', [file], { encoding: 'utf8' });
  process.stdout.write(`\n=== ${file} ===\n`);
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);

  const m = /(\d+) passed, (\d+) failed/.exec(r.stdout || '');
  const reported = m ? Number(m[2]) : null;
  if (r.status !== 0 || (reported != null && reported > 0)) {
    failures++;
    process.stdout.write(`>> ${file} FAILED\n`);
  }
}

process.stdout.write(`\n${failures ? `${failures} test file(s) failed` : 'All test files passed'}\n`);
process.exit(failures ? 1 : 0);
