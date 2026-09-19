/* Publishing leaves each class's finished page ready, so a student request is a
   cache read rather than a spreadsheet open, a payload parse and a markup
   build. What must hold: the ready copy is identical to a freshly built one,
   the staff view is never cached or served from cache, and publishing throws
   the old copies away before making new ones. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const gs = fs.readFileSync('apps-script/Sync.gs', 'utf8');

let store = {}, reads = 0, builds = 0;
const stub = `
var Utilities = {formatDate: () => 'Sat, Sep 12, 4:00 PM'};
var Session = {getScriptTimeZone: () => 'UTC'};
var HtmlService = {
  XFrameOptionsMode: {ALLOWALL: 'ALLOWALL'},
  createHtmlOutput: h => ({html: h, setTitle(t){this.title=t; return this;},
    setXFrameOptionsMode(m){this.xf=m; return this;}})
};
var CacheService = {getScriptCache: () => ({
  get: k => (k in store ? store[k] : null),
  put: (k, v) => { store[k] = v; },
  removeAll: ks => ks.forEach(k => delete store[k])
})};
var getCalendar = () => ({courses: {1: {tag: 'P1'}, 2: {tag: 'P2'}}});
var readPublished = tag => { reads++; return {
  ok: true, tag: tag, course: {tag: tag, name: 'AP Phys', ink: '#0B4C81'},
  updated: '2026-09-12T20:00:00Z', links: [],
  weeks: [{label: 'SEP 7 – SEP 11, 2026', mon: '2026-09-07', days: [
    {d: 'Mon Sep 7', iso: '2026-09-07', off: 'Labor Day'},
    {d: 'Tue Sep 8', iso: '2026-09-08', meets: [], nomeet: 1},
    {d: 'Wed Sep 9', iso: '2026-09-09', meets: [{block: 'Block 2',
      cw: [{bullet: false, spans: [{t: 'Read ', }, {t: 'the packet', url: 'https://x/p'}]}],
      hw: null}]}
  ]}]}; };
`;
eval(stub + gs.slice(gs.indexOf('function esc('), gs.indexOf('/* ---------- the colleague view')));

console.log('--- cold, then warm ---');
store = {}; reads = 0;
const cold = studentPage('P1');
console.log('cold build reads the payload :', reads === 1);
console.log('and leaves a copy behind     :', !!store['html:P1']);
const warm = studentPage('P1');
console.log('warm request reads nothing   :', reads === 1, '(payload reads still ' + reads + ')');
console.log('same page either way         :', cold.html === warm.html);
console.log('  same tab title             :', cold.title === warm.title, '|', warm.title);

console.log('');
console.log('--- the ready copy is the real page, not a stub ---');
console.log('renders the week   :', /SEP 7/.test(warm.html));
console.log('renders a link     :', warm.html.includes('https://x/p'));
console.log('renders no-class   :', /No class today/.test(warm.html));
console.log('embeddable         :', warm.xf === 'ALLOWALL');

console.log('');
console.log('--- a damaged copy must not break the page ---');
const good = store['html:P1'];
for (const [what, bad] of [['no newline', 'no newline here at all'],
                           ['truncated', good.slice(0, 40)],
                           ['empty', '']]) {
  store['html:P1'] = bad; reads = 0;
  const odd = studentPage('P1');
  console.log('  ' + what.padEnd(11), 'rebuilt:', reads === 1,
              '| real page:', /<!doctype html>/.test(odd.html) && /SEP 7/.test(odd.html));
}

console.log('');
console.log('--- publishing rebuilds every class ---');
store = {'html:P1': 'stale\\n<old/>', 'pub:P1': 'stale', 'html:P2': 'stale\\n<old/>'};
warmPages();
console.log('every class is ready  :', !!store['html:P1'] && !!store['html:P2']);
console.log('and the stale one went:', !/old/.test(store['html:P1']));

console.log('');
console.log('--- what publish() does, read from the source ---');
const pub = gs.slice(gs.indexOf('function publish('), gs.indexOf('function readPublished'));
console.log('clears the page copies too :', /'html:' \+ t/.test(pub));
console.log('then builds them again     :', /warmPages\(\)/.test(pub));
console.log('clears before it rebuilds  :', pub.indexOf('removeAll') < pub.indexOf('warmPages'));

console.log('');
console.log('--- the staff view is never cached ---');
const doGet = gs.slice(gs.indexOf('function doGet'), gs.indexOf('function out('));
console.log('only a non-staff page is served ready-made:', /if \(q\.page && !staff\) return studentPage/.test(doGet));
const sp = gs.slice(gs.indexOf('function studentPage'), gs.indexOf('function warmPages'));
console.log('the cached path never calls staffFeed     :', !/staffFeed/.test(sp));
