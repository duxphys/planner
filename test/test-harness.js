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
    from: 'var t = esc(sp.url || sp.held ? linkLabel(sp.t, true) : sp.t);',
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
  },
  {
    what: 'a missing Short names tab is said',
    file: 'apps-script/Sync.gs',
    from: "var note = forms ? '' : 'no ' + DOCS_SHORT",
    to:   "var note = '' ? '' : 'no ' + DOCS_SHORT",
    test: 'test-shortnames.js'
  },
  {
    what: 'the planner shows a note that comes with the list',
    file: 'sync.js',
    from: "  docsNote = d.note || '';",
    to:   "  void 0;",
    test: 'test-docnames.js'
  },
  {
    what: 'the Short names tab is found whatever its case',
    file: 'apps-script/Sync.gs',
    from: "if (!sh && String(t.getName()).trim().toLowerCase() === want) sh = t;",
    to:   "if (!sh && t.getName() === DOCS_SHORT) sh = t;",
    test: 'test-shortnames.js'
  },
  {
    what: 'a wrong token says nothing about how the right one starts',
    file: 'apps-script/Sync.gs',
    from: "error: 'that token does not match (sent ' + q.token.length +",
    to:   "error: (q.token.slice(0, 4) === want.slice(0, 4) ? 'it starts correctly; ' : '') + 'that token does not match (sent ' + q.token.length +",
    test: 'test-doors.js'
  },
  {
    what: 'a colleague k opens nothing more than the student JSON',
    file: 'apps-script/Sync.gs',
    from: '    return out(readPublished(tag));',
    to:   "    return out(q.k ? {ok: true, staff: true, weeks: []} : readPublished(tag));",
    test: 'test-doors.js'
  },
  {
    what: 'the served page drops private lines itself',
    file: 'apps-script/Sync.gs',
    from: '    if (l.private) continue;                       // the page, again',
    to:   '    void 0;',
    test: 'test-serverpage.js'
  },
  {
    what: "two tabs keep their own queues",
    file: "sync.js",
    from: "tabs[TAB] = {at: Date.now(), queue, base: b};",
    to:   "s.tabs = {}; tabs[TAB] = {at: Date.now(), queue, base: b}; for (const id of Object.keys(tabs)) if (id !== TAB) delete tabs[id];",
    test: "test-tabs.js"
  },
  {
    what: "each tab names itself",
    file: "sync.js",
    from: "const me = () => cfg.device + '.' + TAB.slice(-4);",
    to:   "const me = () => cfg.device;",
    test: "test-tabs.js"
  },
  {
    what: "another open tab's edits are left to it",
    file: "sync.js",
    from: "if (id !== TAB && Date.now() - (t.at || 0) < TAB_ORPHAN) return;   // an open tab's",
    to:   "void 0;",
    test: "test-tabs.js"
  },
  {
    what: "an abandoned tab's edits are taken up",
    file: "sync.js",
    from: "if (id !== TAB && Date.now() - (t.at || 0) < TAB_ORPHAN) return;   // an open tab's",
    to:   "if (id !== TAB) return;",
    test: "test-tabs.js"
  },
  {
    what: "a taken-up edit keeps its version",
    file: "sync.js",
    from: "if (t.base && t.base[k] !== undefined) base[k] = t.base[k];",
    to:   "void 0;",
    test: "test-tabs.js"
  },
  {
    what: "a store from v53 is taken up",
    file: "sync.js",
    from: "const tabs = s.tabs || (s.queue && Object.keys(s.queue).length ? {legacy: {at: 0, queue: s.queue, base: s.base}} : {});",
    to:   "const tabs = s.tabs || {};",
    test: "test-tabs.js"
  },
  {
    what: "identical content is a landed write",
    file: "sync.js",
    from: "if (sameLines(queue[c.key], c.lines)) { delete queue[c.key]; continue; }",
    to:   "void 0;",
    test: "test-tabs.js"
  },
  {
    what: "Offline only for the network",
    file: "sync.js",
    from: "if (net) return 'Offline' + left;",
    to:   "return 'Offline' + left;",
    test: "test-tabs.js"
  },
  {
    what: "a bad token is named",
    file: "sync.js",
    from: "if (/bad token/i.test(m)) return",
    to:   "if (false) return",
    test: "test-tabs.js"
  },
  {
    what: "start-up failures say what failed",
    file: "sync.js",
    from: "    setNote(failNote(err));\n    clearTimeout(retryTimer);\n    retryTimer = later(startSync, RETRY_MS);",
    to:   "    setNote('Offline \\u2014 ' + (Object.keys(queue).length || 'no') + ' pending');\n    clearTimeout(retryTimer);\n    retryTimer = later(startSync, RETRY_MS);",
    test: "test-tabs.js"
  },
  {
    what: "a web page in reply is named",
    file: "sync.js",
    from: "(title ? ' titled \"' + title[1].trim() + '\"' : '')",
    to:   "''",
    test: "test-tabs.js"
  },
  {
    what: "refused storage is said",
    file: "sync.js",
    from: "} catch (e) { storeDead = true; }",
    to:   "} catch (e) { }",
    test: "test-tabs.js"
  },
  {
    what: "the pages are built outside the publish lock",
    file: "apps-script/Sync.gs",
    from: "    SpreadsheetApp.flush();\n    return {ok: true, now: stamp, through: limit",
    to:   "    warmPages();\n    SpreadsheetApp.flush();\n    return {ok: true, now: stamp, through: limit",
    test: "test-warm.js"
  },
  {
    what: "the pages are still built after publishing",
    file: "apps-script/Sync.gs",
    from: "    try { warmPages(); } catch (err) { console.error('could not warm the pages: ' + err); }\n  }\n  return r;",
    to:   "  }\n  return r;",
    test: "test-warm.js"
  },
  {
    what: "the rotation is the waterfall",
    file: "sync.js",
    from: "((k - 1) * 5 + i) % 7 + 1",
    to:   "((k - 1) * 4 + i) % 7 + 1",
    test: "test-reference.js"
  },
  {
    what: "a closed day does not use up a cycle day",
    file: "sync.js",
    from: "if (!why) cycle = cycle % 7 + 1;",
    to:   "cycle = cycle % 7 + 1;",
    test: "test-reference.js"
  },
  {
    what: "ASP meets whoever had Block 5",
    file: "sync.js",
    from: "rot.concat(rot.length ? [rot[4]] : [])",
    to:   "rot.concat(rot.length ? [rot[0]] : [])",
    test: "test-reference.js"
  },
  {
    what: "a course runs only From to Until",
    file: "sync.js",
    from: "(!c.from || iso >= c.from) && (!c.until || iso <= c.until)",
    to:   "true",
    test: "test-reference.js"
  },
  {
    what: "a vacation week is left out",
    file: "sync.js",
    from: "if (days.every(x => x.off && x.off !== 'Not in the Build Calendar')) continue;",
    to:   "void 0;",
    test: "test-reference.js"
  },
  {
    what: "a copy with a problem is not used",
    file: "sync.js",
    from: "if (problems.length) { refNote = 'Courses / Build Calendar not used",
    to:   "if (false) { refNote = 'Courses / Build Calendar not used",
    test: "test-reference.js"
  },
  {
    what: "never rebuilt under an open cell",
    file: "sync.js",
    from: "if (typeof editingKey === 'function' && editingKey()) return false;    // never under an open cell",
    to:   "void 0;",
    test: "test-reference.js"
  },
  {
    what: "new days pull their records in full",
    file: "sync.js",
    from: "if (applyReference(refCache)) lastPull = '';",
    to:   "applyReference(refCache);",
    test: "test-reference.js"
  },
  {
    what: "the reference is read before records",
    file: "sync.js",
    from: "try { await pullReference(); }",
    to:   "try { }",
    test: "test-reference.js"
  },
  {
    what: "data.js keeps which periods meet",
    file: "sync.js",
    from: "b.course = was ? (courseFor(ref.courses || [], b.period, d.iso) || was) : null;",
    to:   "b.course = courseFor(ref.courses || [], b.period, d.iso);",
    test: "test-reference.js"
  },
  {
    what: "the last copy is used at start-up",
    file: "sync.js",
    from: "if (refCache && applyReference(refCache)) { centreOnToday(); render(); }",
    to:   "void 0;",
    test: "test-reference.js"
  },
  {
    what: "a first day already planned is refused",
    file: "sync.js",
    from: "if (first <= last0) problems.push(",
    to:   "if (false) problems.push(",
    test: "test-reference.js"
  },
  {
    what: "the Courses table ends at a blank period",
    file: "apps-script/Sync.gs",
    from: "i < rows.length && String(rows[i][col.period]).trim(); i++",
    to:   "i < rows.length; i++",
    test: "test-reference.js"
  },
  {
    what: "the Build Calendar examples are skipped",
    file: "apps-script/Sync.gs",
    from: "if (!text || /^e\\.g\\./i.test(text) || !type) continue;",
    to:   "if (!text || !type) continue;",
    test: "test-reference.js"
  },
  {
    what: "the reference notes reach the page",
    file: "render.js",
    from: "typeof refNote !== 'undefined' && refNote].filter(Boolean)",
    to:   "false].filter(Boolean)",
    test: "test-reference.js"
  },
  {
    what: "a stray page is asked about once more",
    file: "sync.js",
    from: "if (!again) {\n      console.warn(action + ': a page came back",
    to:   "if (false) {\n      console.warn(action + ': a page came back",
    test: "test-tabs.js"
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
