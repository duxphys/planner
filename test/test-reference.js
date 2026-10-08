/* Reference-in (Shared-Contracts §8, step 13): course names, sections and
 * colours from the Courses tab, by date, and the school days after data.js's
 * last week from Build Calendar.
 *
 * The generator is checked against the real thing: data.js is cut to its first
 * week, semester 1's no-school days and notes are fed in as a Build Calendar,
 * and every generated day must match data.js's own - date, label, cycle, which
 * period sits in which block, notes and closures - for all nineteen weeks. */
const fs = require('fs'), vm = require('vm');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html', 'utf8')
  .replace(/<link[^>]*>/g, '').replace(/<script[^>]*><\/script>/g, '').replace('<script>start();</script>', '');
const read = f => fs.readFileSync(f, 'utf8');
const gs = read('apps-script/Sync.gs');
const grab = name => {
  const i = gs.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0;
  for (let k = gs.indexOf('{', i); k < gs.length; k++) {
    if (gs[k] === '{') d++;
    else if (gs[k] === '}' && --d === 0) return gs.slice(i, k + 1);
  }
};

/* ---------- the server: Sync.gs's reader, against tabs shaped like the real ones ---------- */
const sheet = rows => ({getDataRange: () => ({getValues: () => rows.map(r => r.slice())})});
const server = tabs => new Function('tabs', `
  var REF_COURSES = 'Courses', REF_CAL = 'Build Calendar';
  var REF_COLS = ['period', 'symbol', 'course', 'section', 'fill', 'text', 'from', 'until'];
  function tabIfAny(n) { return tabs[n] ? tabs[n] : null; }
  ${['reference', 'refCalendar', 'refIso', 'refHex'].map(grab).join('\n')}
  return reference();`)(tabs);
const pad = (n, r) => { r = r.slice(); while (r.length < n) r.push(''); return r; };
const COURSES = [['', 'COURSES'], ['', 'Everything downstream reads this.'], [],
  ['', 'Period', 'Symbol', 'Course', 'Section', 'Room', 'Fill', 'Text', 'From', 'Until', 'Notes'],
  ['', 1, '●', 'AP Physics', '350-01', 'A221', 'C4DBEF', '0B4C81', '', '', ''],
  ['', 2, '▲', 'Applied Physics', '333-01', 'A221', 'F7E2BC', '7A4300', '', '', 'Co-taught'],
  ['', 4, '■', 'Applied Physics', '333-02', 'A221', 'E3B571', '5E3200', '', '', ''],
  ['', 5, '◆', 'AP Physics', '350-02', 'A221', '8FBBDF', '0A3A5C', '', '', ''],
  ['', 7, '★', 'AP Physics Lab', '350A-01', 'A221', 'CBCBCB', 333333, '', '1/22/2027', 'Lab section'],
  ['', 6, '★', 'AP Physics Lab', '350A-02', 'A221', 'CBCBCB', 333333, new Date(2027, 0, 25), '', 'Lab section'],
  [], [], [], [], [],
  ['', 'From / Until are optional. Leave both blank for a course that runs all year.']].map(r => pad(11, r));
const CAL = (first, cycle, last, rows) => [['', 'BUILD CALENDAR'], ['', 'Fill this in when...'], [],
  ['', 'First school day', first, 'e.g. 1/25/2027'], ['', 'Its cycle day', cycle, '1–7'],
  ['', 'Last day to build', last, 'Last day of the range'], [], ['', 'EXCEPTIONS'], ['', 'Leave this empty...'],
  ['', 'Date', 'Type', 'Label / note'],
  ['', 'e.g.  2/15/2027', 'No school', 'Presidents Day'], ['', 'e.g.  3/12/2027', 'Half day', '½ Day']]
  .concat(rows || []).concat([[], ['', 'The four rows above are greyed-out examples.']]).map(r => pad(4, r));

console.log('--- the server reads the tabs by header and label ---');
{
  const r = server({Courses: sheet(COURSES), 'Build Calendar': sheet(CAL('', '', ''))});
  const by = p => r.courses.find(c => c.period === p) || {};
  console.log('six courses, notes below not read  :', r.ok === true && r.courses.length === 6 && r.problems.length === 0);
  console.log('colours as #hex, a number too      :', by(1).fill === '#C4DBEF' && by(7).ink === '#333333');
  console.log('Until typed as text                :', by(7).until === '2027-01-22' && by(7).from === '');
  console.log('From as a date cell                :', by(6).from === '2027-01-25' && by(6).until === '');
  console.log('an empty Build Calendar is no problem:', r.calendar === null);
}
{
  const r = server({Courses: sheet(COURSES), 'Build Calendar': sheet(CAL('1/18/2027', 1, new Date(2027, 5, 17), [
    ['', new Date(2027, 0, 18), 'No school', 'MLK Day'], ['', '2/15/2027', 'No school', 'Presidents Day'],
    ['', '3/12/2027', 'Half day', ''], ['', '5/3/2027', 'Note', 'AP Exams begin']]))});
  const c = r.calendar || {};
  console.log('the three values                   :', c.first === '2027-01-18' && c.cycle === 1 && c.last === '2027-06-17');
  console.log('four exceptions, examples skipped  :', (c.exceptions || []).length === 4 &&
    c.exceptions[0].kind === 'off' && c.exceptions[0].label === 'MLK Day' && c.exceptions[2].kind === 'half' && c.exceptions[3].kind === 'note');
}
{
  const bad = COURSES.map(r => r.slice()); bad[5][6] = 'orange'; bad[9][9] = 'soon';
  const r = server({Courses: sheet(bad), 'Build Calendar': sheet(CAL('1/18/2027', 9, '6/17/2027', [
    ['', '2/30/twenty', 'No school', 'x'], ['', '3/1/2027', 'Day off', 'x']]))});
  const said = r.problems.join(' | ');
  console.log('a bad colour is named with its row :', /Courses row 6: Fill and Text/.test(said));
  console.log('a bad date too                     :', /Courses row 10: From and Until/.test(said));
  console.log('a cycle day past 7                 :', /Its cycle day is 1-7/.test(said));
  console.log('an exception date and type         :', /row 13: "2\/30\/twenty" is not a date/.test(said) && /row 14: the type is No school/.test(said));
  const noUntil = COURSES.map(r => r.slice(0, 9));
  console.log('a missing column is an error       :', /no until column/.test(server({Courses: sheet(noUntil)}).error || ''));
  console.log('a calendar with no last day        :', /Last day to build is empty/.test(
    server({Courses: sheet(COURSES), 'Build Calendar': sheet(CAL('1/18/2027', 1, ''))}).problems.join()));
}

/* ---------- the app ---------- */
const disk = {};
const store = m => ({getItem: k => k in m ? m[k] : null, setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }});
function app(opts) {
  opts = opts || {};
  const dom = new JSDOM(html, {pretendToBeVisual: true});
  dom.window.document.execCommand = () => false;
  const ctx = {window: dom.window, document: dom.window.document, console, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: store(disk), sessionStorage: store({}), navigator: {platform: 'Win32', onLine: true},
    JSON, Date, Math, Object, Array, String, Number, Promise, Error, TypeError, RegExp, Map, Set};
  ctx.window.confirm = () => true;
  vm.createContext(ctx);
  vm.runInContext(read('data.js') + (opts.cut ? '\nWEEKS.length = ' + opts.cut + ';' : ''), ctx);
  vm.runInContext(read('render.js') + read('editor.js') + read('sync.js') +
    '\nloadPrefs(); wireToolbar(); wireEditor(); render();', ctx);
  ctx.run = js => vm.runInContext(js, ctx);
  return ctx;
}
const sem1 = JSON.parse(vm.runInNewContext(read('data.js') + '\nJSON.stringify({W, C})'));
const asCourses = C => Object.keys(C).map(p => ({period: +p, sym: C[p].sym, name: C[p].name, sec: C[p].sec,
  fill: C[p].fill, ink: C[p].ink, from: '', until: ''}));

console.log('');
console.log('--- semester 1, rebuilt from a Build Calendar, matches data.js ---');
{
  const A = app({cut: 1});
  const ex = [];
  for (const w of sem1.W.slice(1)) for (const d of w.days) {
    if (d.o) ex.push({iso: d.iso, kind: 'off', label: d.o});
    if (d.n) ex.push({iso: d.iso, kind: 'note', label: d.n});
  }
  // a week data.js leaves out altogether is a closed one: Christmas week
  const have = new Set(sem1.W.flatMap(w => w.days.map(d => d.iso)));
  for (let t = new Date(2026, 8, 7, 12); t <= new Date(2027, 0, 15, 12); t.setDate(t.getDate() + 1)) {
    const iso = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    if (t.getDay() > 0 && t.getDay() < 6 && !have.has(iso)) ex.push({iso, kind: 'off', label: 'Winter Break'});
  }
  const ref = {courses: asCourses(sem1.C), problems: [],
               calendar: {first: '', cycle: null, last: '2027-01-15', exceptions: ex}};
  console.log('it is applied                      :', A.run('applyReference(' + JSON.stringify(ref) + ')') === true);
  const got = JSON.parse(A.run('JSON.stringify(WEEKS.slice(1).map(w => ({label: w.label, mon: w.mon, days: w.days.map(d => ({d: d.d, iso: d.iso, c: d.cycle, o: d.off, n: d.note, b: d.blocks.map(b => [b.block, b.period, b.asp, b.course && b.course.tag])}))})))'));
  const want = sem1.W.slice(1).map(w => ({label: w.label, mon: w.mon, days: w.days.map(d => ({d: d.d, iso: d.iso, c: d.c || null,
    o: d.o || '', n: d.n || '', b: d.b.map(([bi, per]) => [['Block 1', 'Block 2', 'Block 3', 'Block 4', 'Block 5', 'ASP'][bi], per, bi === 5,
      sem1.C[per] ? sem1.C[per].tag : null])}))}));
  let bad = 0, firstBad = '';
  want.forEach((w, i) => { const a = JSON.stringify(got[i]), b = JSON.stringify(w); if (a !== b) { bad++; if (!firstBad) firstBad = w.label; } });
  console.log('every week, day and block the same :', got.length === want.length && bad === 0, '(' + got.length + ' weeks, ' + bad + ' differ' + (firstBad ? ', first ' + firstBad : '') + ')');
}

console.log('');
console.log('--- semester 2 after data.js, with P7 stopping and P6 starting ---');
const S2 = {courses: [
  {period: 1, sym: '●', name: 'AP Physics', sec: '350-01', fill: '#C4DBEF', ink: '#0B4C81', from: '', until: ''},
  {period: 2, sym: '▲', name: 'Applied Physics', sec: '333-01', fill: '#F7E2BC', ink: '#7A4300', from: '', until: ''},
  {period: 4, sym: '■', name: 'Applied Physics', sec: '333-02', fill: '#E3B571', ink: '#5E3200', from: '', until: ''},
  {period: 5, sym: '◆', name: 'AP Physics', sec: '350-02', fill: '#8FBBDF', ink: '#0A3A5C', from: '', until: ''},
  {period: 7, sym: '★', name: 'AP Physics Lab', sec: '350A-01', fill: '#CBCBCB', ink: '#333333', from: '', until: '2027-01-22'},
  {period: 6, sym: '★', name: 'AP Physics Lab', sec: '350A-02', fill: '#CBCBCB', ink: '#333333', from: '2027-01-25', until: ''}],
  problems: [], calendar: {first: '', cycle: null, last: '2027-02-05',
    exceptions: [{iso: '2027-01-18', kind: 'off', label: 'MLK Day'}, {iso: '2027-01-29', kind: 'half', label: ''},
                 {iso: '2027-02-03', kind: 'note', label: 'Faculty Mtg 3–4'}]}};
const A = app();
const day = iso => A.run('JSON.stringify(DAYS.map(x => x.d).find(d => d.iso === ' + JSON.stringify(iso) + ') || null)');
const blocks = iso => (JSON.parse(day(iso)) || {blocks: []}).blocks;
{
  const n0 = A.run('WEEKS.length');
  console.log('applied                            :', A.run('applyReference(' + JSON.stringify(S2) + ')') === true);
  console.log('three weeks added after 15 Jan      :', A.run('WEEKS.length') === n0 + 3 &&
    A.run('WEEKS[WEEKS.length - 3].label') === 'JAN 18 – JAN 22, 2027');
  console.log('MLK Day is no school               :', JSON.parse(day('2027-01-18')).off === 'MLK Day' && blocks('2027-01-18').length === 0);
  console.log('the rotation carries on from 14 Jan :', JSON.parse(day('2027-01-19')).cycle === 1 &&
    blocks('2027-01-19').map(b => b.period).join('') === '123455');
  const tagIn = (iso, p) => (blocks(iso).find(b => b.period === p) || {}).course;
  console.log('P7 meets until 22 Jan              :', !!tagIn('2027-01-20', 7) && tagIn('2027-01-20', 7).tag === 'P7' &&
    JSON.parse(day('2027-01-20')).blocks.some(b => b.period === 7));
  const p6day = ['2027-01-25', '2027-01-26', '2027-01-27', '2027-01-28', '2027-01-29']
    .find(iso => blocks(iso).some(b => b.period === 6));
  const p7day = ['2027-01-25', '2027-01-26', '2027-01-27', '2027-01-28', '2027-01-29']
    .find(iso => blocks(iso).some(b => b.period === 7));
  console.log('P6 is the lab from 25 Jan          :', !!p6day && tagIn(p6day, 6).tag === 'P6' && tagIn(p6day, 6).sec === '350A-02');
  console.log('and P7 is free                     :', !!p7day && tagIn(p7day, 7) === null);
  console.log('a half day still has classes, noted:', JSON.parse(day('2027-01-29')).note === '½ Day' && blocks('2027-01-29').length === 6);
  console.log('a note lands on its day            :', JSON.parse(day('2027-02-03')).note === 'Faculty Mtg 3–4');
  console.log('P6 gets a class switch             :', A.run('ALL.map(a => a[0]).join(" ")') === '1 2 4 5 6 7');
  console.log('data.js\'s days take the tab\'s names:', A.run('WEEKS[1].days.flatMap(d => d.blocks).find(b => b.period === 1).course.name') === 'AP Physics');
  console.log('a new day\'s cell is found by key  :', !!A.run('findRecord("' + p6day + '|P6|cw")'));
  const cal = JSON.parse(A.run('JSON.stringify(calendarPayload())'));
  console.log('and goes to the student pages      :', cal.courses[6] && cal.courses[6].tag === 'P6' &&
    cal.weeks.some(w => w.mon === '2027-01-25'));
  const noP4 = Object.assign({}, S2, {courses: S2.courses.filter(c => c.period !== 4)});
  const E = app(); E.run('applyReference(' + JSON.stringify(noP4) + ')');
  console.log('a period the tab lacks keeps data.js\'s:', E.run('WEEKS[1].days.flatMap(d => d.blocks).find(b => b.period === 4).course.name') === 'Applied Phys');
  console.log('the same copy again changes nothing:', A.run('applyReference(' + JSON.stringify(S2) + ')') === false);
  A.run('render()');
}

console.log('');
console.log('--- read from the endpoint, kept, and shown offline ---');
{
  const B = app();
  B.run(`cfg.url = 'https://x/exec'; cfg.token = 't';
    fetch = async (u, o) => { const r = JSON.parse(o.body);
      if (r.action === 'reference') return {json: async () => (Object.assign({ok: true}, ${JSON.stringify(S2)}))};
      if (r.action === 'pull') return {json: async () => ({ok: true, now: 'T1', records: r.since ? [] :
        [{key: '2027-01-26|P1|cw', updatedAt: 'T1', lines: [{bullet: false, private: false, spans: [{t: 'Torque lab', url: null, rel: false, priv: false}]}]}]})};
      return {json: async () => ({ok: true, now: 'T1', saved: [], conflicts: [], weeks: 0, byTag: {}, files: {}})}; };`);
  B.run('lastPull = "T0"');                           // as on a later sync, not the first
  return B.run('startSync()').then(() => {
    const cw = B.run('JSON.stringify((DAYS.map(x => x.d).find(d => d.iso === "2027-01-26").blocks.find(b => b.period === 1) || {}).cw)');
    console.log('new days fetch their records in full:', /Torque lab/.test(cw || ''));
    const C2 = app();
    C2.run('fetch = async () => { throw new TypeError("Failed to fetch"); }; wireSync(); clearTimeout(retryTimer);');
    console.log('a fresh page has them before syncing:', C2.run('DAYS.some(x => x.d.iso === "2027-01-26")'));

    console.log('');
    console.log('--- a copy that cannot be used is not used ---');
    const D = app(), n = D.run('WEEKS.length');
    const broken = Object.assign({}, S2, {problems: ['Courses row 6: Fill and Text are colours like C4DBEF']});
    console.log('nothing changes                    :', D.run('applyReference(' + JSON.stringify(broken) + ')') === false && D.run('WEEKS.length') === n);
    D.run('render()');
    console.log('and the page says why              :', /not used — Courses row 6/.test(D.document.getElementById('hint').textContent));
    const early = Object.assign({}, S2, {calendar: Object.assign({}, S2.calendar, {first: '2027-01-11'})});
    D.run('applyReference(' + JSON.stringify(early) + ')');
    console.log('a first day already planned is refused:', D.run('WEEKS.length') === n && /already in the planner/.test(D.run('refNote')));
    const gap = Object.assign({}, S2, {calendar: Object.assign({}, S2.calendar, {first: '2027-01-25', cycle: 3})});
    console.log('a later first day leaves a gap, said:', D.run('applyReference(' + JSON.stringify(gap) + ')') === true &&
      JSON.parse(D.run('JSON.stringify(DAYS.map(x => x.d).find(d => d.iso === "2027-01-20"))')).off === 'Not in the Build Calendar' &&
      /5 school day\(s\) before/.test(D.run('refNote')) && D.run('DAYS.map(x => x.d).find(d => d.iso === "2027-01-25").cycle') === 3);
    const G = app();
    G.run('editingKey = () => "2026-09-02|P1|cw"');
    console.log('never under an open cell           :', G.run('applyReference(' + JSON.stringify(S2) + ')') === false && G.run('WEEKS.length') === n);
    process.exit(process.exitCode || 0);
  });
}
