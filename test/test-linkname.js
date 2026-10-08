/* A link pasted from Drive is labelled with the file's whole name. I see it
   without the file type; students see it cut at the version. Display only:
   what is stored never changes. Run against render.js and Sync.gs themselves. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');
const gs = fs.readFileSync('apps-script/Sync.gs', 'utf8');
const load = f => fs.readFileSync(f, 'utf8');

const NAME = '01.C.5 - UAPM: Quantitative Acceleration Problems v.26.1 (amta).pdf';
// [stored label, what I see, what students see]
const TABLE = [
  [NAME, '01.C.5 - UAPM: Quantitative Acceleration Problems v.26.1 (amta)',
         '01.C.5 - UAPM: Quantitative Acceleration Problems'],
  ['01.A.1 - Practice - Speed Calculations v.26.1', '01.A.1 - Practice - Speed Calculations v.26.1',
   '01.A.1 - Practice - Speed Calculations'],                          // a Google Doc has no type
  ['04.A.1.2 - Springs v.26.2 (sp) (key).docx', '04.A.1.2 - Springs v.26.2 (sp) (key)', '04.A.1.2 - Springs'],
  ['Ch. 3 Reading v.26.1.PDF', 'Ch. 3 Reading v.26.1', 'Ch. 3 Reading'],
  ['AP - Unit 4 v.26', 'AP - Unit 4 v.26', 'AP - Unit 4'],             // a unit folder
  ['RD.1 - Course Guide.docx', 'RD.1 - Course Guide', 'RD.1 - Course Guide'],
  ['the packet', 'the packet', 'the packet'],                          // typed by hand
  ['Lab v2 notes', 'Lab v2 notes', 'Lab v2 notes'],                    // not a version
  ['Problems version 3', 'Problems version 3', 'Problems version 3'],
  ['.pdf', '.pdf', '.pdf']                                             // never cut to nothing
];

// Sync.gs's own copy, pulled out by name
const grab = name => {
  const i = gs.indexOf('function ' + name + '(');
  let d = 0;
  for (let k = gs.indexOf('{', i); k < gs.length; k++) {
    if (gs[k] === '{') d++;
    else if (gs[k] === '}' && --d === 0) return gs.slice(i, k + 1);
  }
};
const server = new Function(grab('linkLabel') + '; return linkLabel;')();

// the page: render.js and editor.js on a jsdom copy of index.html
const html = load('index.html').replace(/<link[^>]*>/g, '')
  .replace(/<script[^>]*><\/script>/g, '').replace('<script>start();</script>', '');
const dom = new JSDOM(html, {pretendToBeVisual: true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem: () => null, setItem: () => {}};
global.navigator = dom.window.navigator;
global.T = {TABLE, server, NAME};
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + `
console.log('--- one table, both sides ---');
const miss = [];
for (const [stored, mine, theirs] of T.TABLE) {
  const got = [linkLabel(stored, false), linkLabel(stored, true), T.server(stored, false), T.server(stored, true)];
  if (got.join('|') !== [mine, theirs, mine, theirs].join('|')) miss.push(stored + ' -> ' + got.join(' / '));
}
console.log('every row as listed, page and script:', miss.length === 0, miss.length ? miss : '');

console.log('');
console.log('--- the planner ---');
loadPrefs(); wireToolbar(); wireEditor(); render();
const c = document.querySelector('.cell.sub[data-f]');
const rec = recOf(c), f = fieldOf(c);
const keep = [{bullet: false, private: false, spans: [
  {t: 'Read ', url: null, rel: false, priv: false},
  {t: T.NAME, url: 'https://drive.google.com/file/d/abc/view', rel: true, priv: false},
  {t: ' then v.26.1 is just words', url: null, rel: false, priv: false}]}];
rec[f] = JSON.parse(JSON.stringify(keep));
student = false; c.innerHTML = lines(rec[f]);
const a = () => c.querySelector('a');
console.log('I see it without .pdf             :', a().textContent === T.TABLE[0][1]);
console.log('words that are not a link stay    :', c.textContent.endsWith('then v.26.1 is just words'));
openCell(c);
console.log('an open cell shows it whole       :', a().textContent === T.NAME);
closeCell();
console.log('and closing it changes nothing    :', JSON.stringify(rec[f]) === JSON.stringify(keep));
console.log('closed again, without .pdf        :', a().textContent === T.TABLE[0][1]);
student = true; c.innerHTML = lines(rec[f]);
console.log('student preview cuts at the version:', a().textContent === T.TABLE[0][2]);
student = false;
`);

console.log('');
console.log('--- what students are sent ---');
eval(grab('redactLines') + grab('linkLabel'));
const sp = (t, o) => Object.assign({t, url: null, rel: false, priv: false}, o);
const src = [{bullet: false, private: false, spans: [
  sp(NAME, {url: 'https://drive.google.com/file/d/abc/view', rel: true}),
  sp(' and '),
  sp('04.A.1.2 - Springs v.26.2 (sp) (key).docx', {url: 'https://drive.google.com/file/d/key/view', rel: false}),
  sp(' (bring v.26.1 of the packet)')]}];
const before = JSON.stringify(src);
const red = redactLines(src);
const s = red[0].spans;
console.log('a released link is cut            :', s[0].t === TABLE[0][2] && s[0].url === 'https://drive.google.com/file/d/abc/view');
console.log('so is a held one                  :', s[2].t === '04.A.1.2 - Springs' && s[2].held === 1 && !('url' in s[2]));
console.log('typed words are left alone        :', s[3].t === ' (bring v.26.1 of the packet)');
console.log('what is stored is not touched     :', JSON.stringify(src) === before);

// the served page, students' and staff
const stub = `var Utilities = {formatDate: () => 'Wed, Oct 7, 7:00 PM'};
var Session = {getScriptTimeZone: () => 'UTC'};
var HtmlService = {XFrameOptionsMode: {ALLOWALL: 'ALLOWALL'},
  createHtmlOutput: h => ({html: h, setTitle() { return this; }, setXFrameOptionsMode() { return this; }})};`;
const P = new Function(stub + gs.slice(gs.indexOf('function esc('), gs.indexOf('/* ---------- document titles')) +
  '; return page;')();
const feed = (staff, lines) => ({ok: true, staff, tag: 'P1', course: {tag: 'P1', name: 'AP Phys', ink: '#0B4C81'},
  updated: '2026-10-07T23:00:00Z', links: [], weeks: [{label: 'OCT 5 – 9, 2026', mon: '2026-10-05',
  days: [{d: 'Wed Oct 7', iso: '2026-10-07', meets: [{block: 'Block 1', cw: lines, hw: null}]}]}]});
const pupil = P(feed(false, red)).html;
console.log('the student page shows the cut name:', pupil.includes(TABLE[0][2] + '</a>') &&
  !pupil.includes('v.26.1 (amta)') && !/\.(pdf|docx)</.test(pupil));
/* v47: the page has no staff view. Even a payload claiming one, and never
   redacted, comes out cut, with the held link as words. */
const staff = P(feed(true, src)).html;
console.log('a staff payload is still cut      :', staff.includes(TABLE[0][2] + '</a>') &&
  !staff.includes('v.26.1 (amta)') && !staff.includes('drive.google.com/file/d/key'));
