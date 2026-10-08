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
  },
  {
    /* Found on 7 Oct: the old scan had a hand-written file list that named four
       deleted files and never looked at test/ at all, so a name sitting in a
       fixture was invisible to it. Prove the widened scan actually reaches an
       ordinary source file. */
    what: 'a real student name anywhere in the repo is caught',
    file: 'render.js',
    from: 'const isOff = d => !d.cycle;',
    /* Assembled rather than written out. This file ships too, so spelling the
       code and the name next to each other here would be found by the very scan
       this case tests, and the baseline would fail on the unbroken copy — which
       it did, once, including from inside this comment. Keep the two halves
       apart in the source; they are only joined in the file that gets written. */
    to:   'const isOff = d => !d.cycle;   // e.g. ' + 'AB' + ': K Whitlock',
    test: 'test-security.js'
  },
  {
    what: 'the record tab grows instead of refusing a save',
    file: 'apps-script/Sync.gs',
    from: 'if (short > 0) sh.insertRowsAfter(sh.getMaxRows(), short + 500);',
    to:   'void 0;',
    test: 'test-records.js'  },
  {
    what: 'a save is followed by a backup when one is due',
    file: 'apps-script/Sync.gs',
    from: 'if (done.ok) backupIfDue();',
    to:   'void 0;',
    test: 'test-records.js'  },
  {
    what: 'backups are weekly, not every save',
    file: 'apps-script/Sync.gs',
    from: 'if (at && Date.now() - at < BACKUP_EVERY) return;',
    to:   'void 0;',
    test: 'test-records.js'  },
  {
    what: 'a failed backup is not retried on every save',
    file: 'apps-script/Sync.gs',
    from: 'if (failed && Date.now() - failed < 86400000) return;',
    to:   'void 0;',
    test: 'test-records.js'  },
  {
    what: 'old backups are trimmed',
    file: 'apps-script/Sync.gs',
    from: 'for (var i = KEEP_BACKUPS; i < kept.length; i++) kept[i].f.setTrashed(true);',
    to:   'void 0;',
    test: 'test-records.js'
  },
  {
    /* a backup that throws would turn a saved record into a failed save */
    what: 'a failed backup never costs the save',
    file: 'apps-script/Sync.gs',
    from: 'return {ok: false, error: why};',
    to:   'throw err;',
    test: 'test-records.js'
  },
  {
    what: 'students are sent link labels cut at the version',
    file: 'apps-script/Sync.gs',
    from: 'if (sp.url) sp = {t: shownLabel(sp.t, sp.url, names, true), url: sp.url, rel: sp.rel};',
    to:   'void 0;',
    test: 'test-linkname.js'
  },
  {
    what: 'the planner shows link labels trimmed',
    file: 'render.js',
    from: "esc(s.url ? shownLabel(s.t, s.url, docsByFile, student) : s.t)",
    to:   "esc(s.t)",
    test: 'test-linkname.js'
  },
  {
    what: 'the served page trims labels too',
    file: 'apps-script/Sync.gs',
    from: 'var t = esc(sp.url || sp.held ? linkLabel(sp.t, !staff) : sp.t);',
    to:   'var t = esc(sp.t);',
    test: 'test-linkname.js'
  },
  {
    what: 'publishing sends students the docs app\'s names',
    file: 'apps-script/Sync.gs',
    from: "redactLines(parse(recs[key + 'cw'].json), names)",
    to:   "redactLines(parse(recs[key + 'cw'].json))",
    test: 'test-docnames.js'
  },
  {
    what: 'the planner shows the docs app\'s names',
    file: 'render.js',
    from: 'if (d && /^[0-9A-Za-z]+(?:\\.[0-9A-Za-z]+)+ - /.test(String(t))) return forStudents ? d.s : d.f;',
    to:   'void 0;',
    test: 'test-docnames.js'
  },
  {
    what: 'a label typed over by hand is kept',
    file: 'apps-script/Sync.gs',
    from: 'if (d && /^[0-9A-Za-z]+(?:\\.[0-9A-Za-z]+)+ - /.test(String(t)))',
    to:   'if (d)',
    test: 'test-docnames.js'
  },
  {
    what: 'only this year\'s files are named from the docs app',
    file: 'apps-script/Sync.gs',
    from: 'if (!fid || yr(r) !== year ||',
    to:   'if (!fid ||',
    test: 'test-docnames.js'
  },
  {
    what: 'a missing docs column is an error, not an empty list',
    file: 'apps-script/Sync.gs',
    from: "if (missing.length) return {ok: false, error: 'the docs workbook has no '",
    to:   "if (false) return {ok: false, error: 'the docs workbook has no '",
    test: 'test-docnames.js'
  },
  {
    what: 'a failed docs read keeps the last list',
    file: 'sync.js',
    from: "try { docsNote = ''; await pullDocs(); }",
    to:   "try { docsNote = ''; docsByFile = {}; await pullDocs(); }",
    test: 'test-docnames.js'
  },
  {
    what: 'docs names take their short forms',
    file: 'apps-script/Sync.gs',
    from: "name: shorten(get(r, 'name'), forms),",
    to:   "name: get(r, 'name'),",
    test: 'test-shortnames.js'
  },
  {
    what: 'a malformed Short names tab is said',
    file: 'apps-script/Sync.gs',
    from: "  if (typeof forms === 'string') return {ok: false, error: forms};\n",
    to:   "  if (typeof forms === 'string') forms = [];\n",
    test: 'test-shortnames.js'
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
