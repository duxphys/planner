/* Links follow the docs app's names by Drive id (Shared-Contracts §9.4): read
   from the docs workbook's _Files tab, shown in the planner, and published to
   students. Run against Sync.gs, render.js and sync.js themselves. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');
const gs = fs.readFileSync('apps-script/Sync.gs', 'utf8');
const load = f => fs.readFileSync(f, 'utf8');
const grab = name => {
  const i = gs.indexOf('function ' + name + '(');
  let d = 0;
  for (let k = gs.indexOf('{', i); k < gs.length; k++) {
    if (gs[k] === '{') d++;
    else if (gs[k] === '}' && --d === 0) return gs.slice(i, k + 1);
  }
};
const docsSection = gs.slice(gs.indexOf("/* ---------- the docs app's names"), gs.indexOf('/* ---------- store'));

// realistic Drive ids and rows; columns in an order of their own
const ID = {acc: '1Qx8dLm3VwZpRt7YbN2kFj5HsA9cE4uGo', spr: '1Hn4KcT0pWq2ZrX6vJ8mYb3LdS5fA7eGu',
            old: '1Zt5RbN9qWx3LmK7vC2pYj8HdF4sE6aGo', guide: '1Mk2VbN8qRx5LtZ3wC7pYj9HdF4sE6aGu'};
const HEAD = ['flag', 'file id', 'name', 'num', 'part', 'ver', 'tag', 'role', 'mod', 'students', 'id', 'item'];
const row = o => HEAD.map(h => o[h] || '');
const ROWS = [HEAD,
  row({'file id': ID.acc, num: '01.C.5', name: 'UAPM: Quantitative Acceleration Problems', ver: '26.1', tag: 'amta'}),
  row({'file id': 'https://drive.google.com/file/d/' + ID.spr + '/view', num: '04.A.1', part: '2', name: 'Springs',
       ver: '26.2', tag: 'sp', role: 'key template', mod: 'larger print'}),
  row({'file id': ID.old, num: '01.C.4', name: 'Acceleration Problems', ver: '25.3'}),   // last year
  row({'file id': ID.guide, num: 'RD.1', name: 'Course Guide', ver: '26.1'}),
  row({'file id': '', num: '01.C.6', name: 'Not made yet', ver: '26.1'})];
const docsBook = rows => {
  const files = {getName: () => '_Files', getDataRange: () => ({getDisplayValues: () => rows.map(r => r.slice())})};
  return {getSheetByName: n => n === '_Files' ? files : null, getSheets: () => [files]};
};
const server = (props, books) => new Function('PropertiesService', 'SpreadsheetApp',
  grab('fileId') + docsSection + grab('linkLabel') + grab('shownLabel') +
  '; return {docNames, shownLabel};')(
  {getScriptProperties: () => ({getProperty: k => props[k] || null})},
  {openById: id => { if (!books[id]) throw new Error('Requested entity was not found.'); return books[id]; }});

console.log('--- reading the docs workbook ---');
const S = server({DOCS_ID: 'DOCS'}, {DOCS: docsBook(ROWS)});
const r = S.docNames();
const F = r.files || {};
console.log('it reads                          :', r.ok === true && r.year === '26' && r.count === 3, r.ok ? '' : r.error);
console.log('my label is the file name, no type:',
  !!F[ID.acc] && F[ID.acc].f === '01.C.5 - UAPM: Quantitative Acceleration Problems v.26.1 (amta)');
console.log('students\' is number and name      :',
  !!F[ID.acc] && F[ID.acc].s === '01.C.5 - UAPM: Quantitative Acceleration Problems');
console.log('a part, tags, mod, key last       :',
  !!F[ID.spr] && F[ID.spr].f === '04.A.1.2 - Springs v.26.2 (sp) (mod) (template) (key)' && F[ID.spr].s === '04.A.1.2 - Springs');
console.log('an id stored as a link is found   :', !!F[ID.spr]);
console.log('the mod text never leaves         :', !JSON.stringify(r).includes('larger print'));
console.log('last year\'s file is left alone    :', !F[ID.old]);
const err = (props, books, rows) => server(props, books).docNames();
const noNum = ROWS.map(x => x.filter((_, i) => HEAD[i] !== 'num'));
console.log('no DOCS_ID is said, not empty     :', /DOCS_ID is not set/.test(err({}, {}).error || ''));
console.log('nor a workbook that will not open :', /would not open/.test(err({DOCS_ID: 'GONE'}, {}).error || ''));
console.log('nor a missing column              :', /no num column/.test(err({DOCS_ID: 'D'}, {D: docsBook(noNum)}).error || ''));

console.log('');
console.log('--- which links follow it, page and script alike ---');
const url = id => 'https://drive.google.com/file/d/' + id + '/view?usp=drive_link';
const CASES = [   // [stored words, url, mine, students']
  ['01.C.4 - UAPM: Acceleration Problems v.26.1 (amta).pdf', url(ID.acc),
   F[ID.acc].f, F[ID.acc].s],                                            // renumbered since pasted
  ['the acceleration packet', url(ID.acc), 'the acceleration packet', 'the acceleration packet'],   // typed over
  ['01.C.4 - Acceleration Problems v.25.3.pdf', url(ID.old),
   '01.C.4 - Acceleration Problems v.25.3', '01.C.4 - Acceleration Problems'],   // not listed
  ['RD.1 - Course Guide v.26.1', 'https://drive.google.com/open?id=' + ID.guide, F[ID.guide].f, F[ID.guide].s],
  ['01.C.5 - Something.pdf', 'https://example.org/x', '01.C.5 - Something', '01.C.5 - Something']];
const html = load('index.html').replace(/<link[^>]*>/g, '')
  .replace(/<script[^>]*><\/script>/g, '').replace('<script>start();</script>', '');
const dom = new JSDOM(html, {pretendToBeVisual: true});
global.window = dom.window; global.document = dom.window.document;
const mem = {};
global.localStorage = {getItem: k => k in mem ? mem[k] : null, setItem: (k, v) => { mem[k] = String(v); }};
Object.defineProperty(globalThis, 'navigator', {value: {platform: 'Test'}, configurable: true});
document.execCommand = () => false;
let answer = {ok: true, year: '26', count: 3, files: F};
global.fetch = async (u, opt) => {
  const req = JSON.parse(opt.body);
  if (req.action === 'docs') return {json: async () => answer};
  return {json: async () => ({ok: true, now: new Date().toISOString(), records: [], saved: [], conflicts: []})};
};
global.T = {CASES, S, F, ID, url, mem, setAnswer: a => { answer = a; }};

eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + `
T.done = (async () => {
const miss = [];
for (const [t, u, mine, theirs] of T.CASES) {
  const got = [shownLabel(t, u, T.F, false), shownLabel(t, u, T.F, true),
               T.S.shownLabel(t, u, T.F, false), T.S.shownLabel(t, u, T.F, true)];
  if (got.join('|') !== [mine, theirs, mine, theirs].join('|')) miss.push(t + ' -> ' + got.join(' / '));
}
console.log('every case as listed, both sides  :', miss.length === 0, miss.length ? miss : '');
console.log('no list is the old rule           :', shownLabel(T.CASES[0][0], T.CASES[0][1], undefined, true) ===
  linkLabel(T.CASES[0][0], true));

console.log('');
console.log('--- the planner ---');
loadPrefs(); wireToolbar(); wireEditor(); render();
loadSync(); cfg.url = 'https://fake/exec'; cfg.token = 'good';
await pullDocs();
console.log('the list is read and kept         :', Object.keys(docsByFile).length === 3 &&
  JSON.parse(T.mem[SYNC_KEY]).docs[T.ID.acc].s === T.F[T.ID.acc].s);
const c = document.querySelector('.cell.sub[data-f]');
const rec = recOf(c), f = fieldOf(c);
const keep = [{bullet: false, private: false, spans: [
  {t: T.CASES[0][0], url: T.CASES[0][1], rel: true, priv: false}]}];
rec[f] = JSON.parse(JSON.stringify(keep));
render();
const a = () => document.querySelector('.cell.sub[data-f]').querySelector('a');
console.log('I see the current name            :', a().textContent === T.F[T.ID.acc].f);
openCell(document.querySelector('.cell.sub[data-f]'));
console.log('an open cell shows what is stored :', a().textContent === T.CASES[0][0]);
closeCell();
console.log('and closing it changes nothing    :', JSON.stringify(rec[f]) === JSON.stringify(keep));
student = true; render();
console.log('student preview: number and name  :', a().textContent === T.F[T.ID.acc].s);
student = false;

T.setAnswer({ok: false, error: 'the docs workbook would not open: gone'});
await startSync();
console.log('a failed read is said             :', /Docs names unavailable.*would not open/.test(document.getElementById('hint').textContent));
console.log('and the last list is kept         :', a().textContent === T.F[T.ID.acc].f);
loadSync();
console.log('a cold start has the last list    :', Object.keys(docsByFile).length === 3);
// read, but with something to say: no Short names tab
T.setAnswer({ok: true, year: '26', count: 3, files: T.F, note: 'no Short names tab in the docs workbook, so names are not shortened'});
await startSync();
console.log('a note with the list is shown     :', /\u26a0 no Short names tab in the docs workbook/.test(document.getElementById('hint').textContent) &&
  Object.keys(docsByFile).length === 3);
T.setAnswer({ok: true, year: '26', count: 3, files: T.F});
await startSync();
console.log('and goes once there is nothing to say:', !/Short names/.test(document.getElementById('hint').textContent));
})().catch(e => console.log('the page side threw               :', false, e.message));
`);

// publishing: names read once, applied to what students are sent
T.done.then(() => {
  console.log('');
  console.log('--- publishing ---');
  const props = {DOCS_ID: 'DOCS'};
  let written = [];
  const today = new Date(Date.now() - 5 * 3600 * 1000), isoOf = d =>
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const day = isoOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7)));
  const run = books => {
    written = [];
    const cell = {t: CASES[0][0], url: CASES[0][1], rel: true, priv: false};
    const ctx = new Function('PropertiesService', 'SpreadsheetApp', 'LockService', 'CacheService', 'recs', 'day', 'sink',
      ['fileId', 'linkLabel', 'shownLabel', 'redactLines', 'horizonISO', 'iso', 'parse', 'noteTextOf',
       'studentReason', 'publish', 'publishLocked'].map(grab).join('\n') + docsSection + `
      var PUB_TAB = '_Published';
      var getCalendar = () => ({courses: {1: {tag: 'P1'}}, weeks: [{label: 'this week', mon: day,
        days: [{d: 'Mon', iso: day, cycle: 1, blocks: [{period: 1, block: 'Block 1'}]}]}]});
      var readAll = () => recs, recTab = () => null, gbLinks = () => ({}), warmPages = () => {};
      var nowIso = () => '2026-10-07T23:00:00Z';
      var tab = () => ({getLastRow: () => 0, getRange: () => ({setValues: v => sink.push(...v), clearContent() {}})});
      return publish();`);
    const res = ctx({getScriptProperties: () => ({getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }})},
      {openById: id => { if (!books[id]) throw new Error('Requested entity was not found.'); return books[id]; }, flush() {}},
      {getScriptLock: () => ({tryLock: () => true, releaseLock() {}})},
      {getScriptCache: () => ({removeAll() {}})},
      {[day + '|P1|cw']: {json: JSON.stringify([{bullet: false, private: false, spans: [cell]}])}}, day, written);
    const p1 = written.find(x => x[0] === 'P1');
    return {res, sent: p1 ? p1[2] : ''};
  };
  const good = run({DOCS: docsBook(ROWS)});
  console.log('it publishes                      :', good.res.ok === true && good.res.docs === 3, good.res.error || '');
  console.log('students get number and name      :', good.sent.includes('"t":"' + F[ID.acc].s + '"') &&
    !good.sent.includes('01.C.4'));
  console.log('Check health is told              :', /^3 files from 2026; no Short names tab in the docs workbook, so names are not shortened, at /.test(props.DOCS_STATE || ''));
  const bad = run({});
  console.log('an unreadable workbook still publishes:', bad.res.ok === true &&
    bad.sent.includes('"t":"01.C.4 - UAPM: Acceleration Problems"'));
  console.log('and says why                      :', /^NOT READ: the docs workbook would not open/.test(props.DOCS_STATE || ''));
});
