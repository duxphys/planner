/* The staff year runs forward, and the page starts at the week in progress. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('agenda/index.html', 'utf8').replace(/<script[^>]*><\/script>/g, '');
const dom = new JSDOM(html, {url: 'https://x.test/agenda/?class=p1&k=secret'});
global.window = dom.window; global.document = dom.window.document;
global.ENDPOINT = 'https://x.test/exec';
const src = fs.readFileSync('agenda/agenda.js', 'utf8')
  .replace(/^if \(typeof document.*$/m, '').replace(/^if \(typeof module.*$/m, '');
eval(src);

const wk = (mon, label) => ({label, mon, days: [{d: 'Wed', iso: mon, meets: [{block: 'B',
  cw: [{bullet: false, spans: [{t: 'work for ' + label}]}], hw: null}]}]});
const weeks = [wk('2026-08-31', 'W1'), wk('2026-09-07', 'W2'),
               wk('2026-09-14', 'W3'), wk('2026-09-21', 'W4')];

jumped = false;
render({ok: true, staff: true, course: {tag: 'P1', name: 'AP Phys'},
        updated: '', today: '2026-09-16', weeks});

const order = [...document.querySelectorAll('.week')].map(s => s.dataset.mon);
console.log('order on the page  :', order.join('  '));
console.log('oldest first       :', order.join() === order.slice().sort().join());
const here = document.querySelector('.week.here');
console.log('landed on          :', here && here.dataset.mon, '(today 2026-09-16)');
console.log('that is the week in progress:', here && here.dataset.mon === '2026-09-14');
console.log('every week has an anchor    :',
  [...document.querySelectorAll('.week')].every(s => /^w\d{8}$/.test(s.id)));

/* `jumped` is scoped inside the eval, so it cannot be reset from out here —
   and the page only ever jumps once by design. Call the chooser directly. */
document.querySelectorAll('.week.here').forEach(s => s.classList.remove('here'));
goToCurrentWeek('2026-08-01');
console.log('');
console.log('before term starts :', document.querySelector('.week.here').dataset.mon,
            '(first week, not nowhere)');
document.querySelectorAll('.week.here').forEach(s => s.classList.remove('here'));
goToCurrentWeek('2027-06-01');
console.log('after the last week :', document.querySelector('.week.here').dataset.mon);

// the student page is unchanged: newest first, no jumping
const gs = fs.readFileSync('apps-script/Sync.gs', 'utf8');
const pub = gs.slice(gs.indexOf('function readPublished'), gs.indexOf('function title'));
console.log('');
console.log('students still newest first :', /a.mon < b.mon \? 1 : -1/.test(pub));
console.log('staff feed no longer reverses:',
  !/weeks.reverse/.test(gs.slice(gs.indexOf('function staffFeed'), gs.indexOf('function readPublished'))));
render({ok: true, course: {tag: 'P1', name: 'AP Phys'}, updated: '', weeks});
console.log('student page never jumps     :', !document.querySelector('.week.here'));
