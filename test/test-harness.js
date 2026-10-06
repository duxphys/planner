/* Does this suite actually bite?
 *
 * On 23 Sep 2026 the answer was no. The private-line filter was removed from
 * render.js — students would have seen every // note in the year — and the
 * suite still reported "51/51 passed". No test file set an exit code, and
 * run-all.js read exit codes only, so a line printing `false` was invisible.
 *
 * So this file tests the tests. It copies the app, breaks one protection at a
 * time, and insists the suite goes red. It also checks the same test passes on
 * an UNBROKEN copy, because a check that always fails proves nothing either.
 *
 * If a change to the app makes a sabotage stop being caught, this file fails
 * and names which one. That is the only guard against the whole suite quietly
 * going lax again.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {execFileSync} = require('child_process');

const APP = path.join(__dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-'));

/* Copy what the tests need. node_modules is linked rather than copied — it is
   large, and nothing here writes to it. */
const COPY = ['index.html', 'styles.css', 'data.js', 'render.js', 'editor.js',
              'sync.js', 'favicon.svg'];
for (const f of COPY) fs.copyFileSync(path.join(APP, f), path.join(work, f));
fs.cpSync(path.join(APP, 'apps-script'), path.join(work, 'apps-script'), {recursive: true});
fs.mkdirSync(path.join(work, 'test'));
for (const f of fs.readdirSync(path.join(APP, 'test'))) {
  if (f === 'node_modules') continue;
  const src = path.join(APP, 'test', f);
  if (fs.statSync(src).isDirectory()) continue;
  fs.copyFileSync(src, path.join(work, 'test', f));
}
try {
  fs.symlinkSync(path.join(APP, 'test', 'node_modules'),
                 path.join(work, 'test', 'node_modules'), 'dir');
} catch (err) {
  fs.cpSync(path.join(APP, 'test', 'node_modules'),
            path.join(work, 'test', 'node_modules'), {recursive: true});
}

/** run one test in the copy, under strict.js; true if it PASSED */
function passes(test) {
  try {
    execFileSync(process.execPath,
      ['-r', path.join(work, 'test', 'strict.js'), test],
      {cwd: path.join(work, 'test'), stdio: 'pipe'});
    return true;
  } catch (err) {
    return false;
  }
}

/** swap one exact string in one file of the copy, and put it back afterwards */
function sabotage(file, from, to) {
  const p = path.join(work, file);
  const was = fs.readFileSync(p, 'utf8');
  if (was.indexOf(from) < 0 || was.split(from).length - 1 !== 1) {
    return {ok: false, restore: () => {}};     // the landmark moved; say so loudly
  }
  fs.writeFileSync(p, was.replace(from, to));
  return {ok: true, restore: () => fs.writeFileSync(p, was)};
}

/* Each entry: a protection, the edit that removes it, and the test that must
   notice. Keep these to one precise string each — a landmark that moves should
   fail this file rather than silently stop testing anything. */
const CASES = [
  {
    what: 'private // lines stripped for students',
    file: 'render.js',
    from: 'ls.filter(l => !(student && l && l.private))',
    to:   'ls.filter(l => true)',
    test: 'audit.js'
  },
  {
    what: 'held links carry no url to students',
    file: 'apps-script/Sync.gs',
    from: '? (sp.rel ? {t: sp.t, url: sp.url} : {t: sp.t, held: 1})',
    to:   '? {t: sp.t, url: sp.url}',
    test: 'test-publish.js'
  },
  {
    what: 'the version guard is not disarmed by a queued edit',
    file: 'sync.js',
    from: 'if (queue[rec.key] !== undefined) continue;',
    to:   'if (false) continue;',
    test: 'test-crossmachine.js'
  },
  {
    what: 'an open cell is committed when the page goes away',
    file: 'editor.js',
    from: "window.addEventListener('beforeunload', commit);",
    to:   "void 0;",
    test: 'test-openceil.js'
  },
  {
    what: 'a background render does not eat the cell being typed in',
    file: 'render.js',
    from: "if (typeof isEditing === 'function' && isEditing()) { deferred = true; return; }",
    to:   "void 0;",
    test: 'test-openceil.js'
  },
  {
    what: 'the version guard covers an open cell too',
    file: 'sync.js',
    from: 'if (open && rec.key === open) { held++; continue; }',
    to:   'void 0;',
    test: 'test-openceil.js'
  },
  {
    what: 'undo and redo reach the sync queue',
    file: 'editor.js',
    from: 'syncKeyChange(snap.w, snap.d, snap.bi, snap.f, rec[f]) &&',
    to:   'false &&',
    test: 'test-openceil.js'
  }
];

console.log('--- each test passes on an unbroken copy ---');
let cleanOk = true;
/* Once per distinct test, not once per case: four cases now share
   test-openceil.js and it was being run — and listed — four times. */
for (const t of [...new Set(CASES.map(c => c.test))]) {
  const ok = passes(t);
  if (!ok) cleanOk = false;
  console.log('  ' + t.padEnd(22) + ':', ok);
}
console.log('baseline is green          :', cleanOk);

console.log('');
console.log('--- and fails when the protection is removed ---');
let allCaught = true;
for (const c of CASES) {
  const s = sabotage(c.file, c.from, c.to);
  if (!s.ok) {
    console.log('  ' + c.what);
    console.log('    MISSING landmark in ' + c.file + ' — this case tested nothing:', false);
    allCaught = false;
    continue;
  }
  const caught = !passes(c.test);
  s.restore();
  if (!caught) allCaught = false;
  console.log('  ' + c.what);
  console.log('    caught by ' + c.test.padEnd(20) + ':', caught);
}

console.log('');
console.log('the suite can fail         :', cleanOk && allCaught);

fs.rmSync(work, {recursive: true, force: true});
