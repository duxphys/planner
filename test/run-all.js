/* Runs the audit, then every behaviour test. Exits non-zero if any fail.
 *
 * Every test is preloaded with strict.js, which turns a logged `false` into a
 * non-zero exit. Before that, this runner read exit codes only — and since no
 * test file ever set one, it reported "ok" for a file whose assertions were
 * failing on screen. See strict.js for what changed and why.
 *
 * strict.js itself is not a test and is skipped.
 */
const {execFileSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const files = ['audit.js'].concat(
  fs.readdirSync(__dirname).filter(f => /^test-.*\.js$/.test(f)).sort());

const pre = ['-r', path.join(__dirname, 'strict.js')];
let bad = [];
for (const f of files) {
  try {
    execFileSync(process.execPath, pre.concat([f]), {cwd: __dirname, stdio: 'pipe'});
    process.stdout.write('  ok   ' + f + '\n');
  } catch (err) {
    bad.push(f);
    process.stdout.write('  FAIL ' + f + '\n');
    const out = String(err.stdout || '') + String(err.stderr || '');
    /* The strict summary is at the end, so the tail is the useful part. Show
       more than before: six lines was routinely too few to see the cause. */
    process.stdout.write(out.split('\n').slice(-14).map(l => '       ' + l).join('\n') + '\n');
  }
}
console.log('\n' + (files.length - bad.length) + '/' + files.length + ' passed');
if (bad.length) console.log('failed: ' + bad.join(' '));
process.exit(bad.length ? 1 : 0);
