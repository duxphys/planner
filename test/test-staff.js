/* The colleague view shows everything I have; the student view still does not.
   The same page renders both, so the difference must come from the feed. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('agenda/index.html', 'utf8').replace(/<script[^>]*><\/script>/g, '');
const dom = new JSDOM(html, {url: 'https://x.test/agenda/?class=p1'});
global.window = dom.window; global.document = dom.window.document;
global.ENDPOINT = 'https://x.test/exec';
const src = fs.readFileSync('agenda/agenda.js', 'utf8')
  .replace(/^if \(typeof document.*$/m, '').replace(/^if \(typeof module.*$/m, '');
eval(src);

const line = (spans, o) => Object.assign({bullet: false, private: false}, o, {spans});
const day = {d: 'Wed Sep 2', iso: '2026-09-02', note: 'Faculty Mtg 3-4', meets: [{
  block: 'Block 1',
  cw: [line([{t: 'Read '}, {t: 'the packet', url: 'https://x/p', rel: true}]),
       line([{t: 'Draft quiz', url: 'https://x/q', rel: false}]),
       line([{t: 'copies made'}], {private: true})],
  hw: null}]};

// what a colleague gets
render({ok: true, staff: true, course: {tag: 'P1', name: 'AP Phys'}, updated: '',
        weeks: [{label: 'W', mon: '2026-08-31', days: [day]}]});
let out = document.getElementById('app').innerHTML;
console.log('--- colleague ---');
console.log('banner shown        :', /Staff view/.test(out));
console.log('released link works :', out.includes('https://x/p'));
console.log('HELD link works too :', out.includes('https://x/q'));
console.log('  and stays marked  :', /class="held"[^>]*href="https:\/\/x\/q"/.test(out));
console.log('private line shown  :', out.includes('copies made'));
console.log('my day note shown   :', out.includes('Faculty Mtg'));

// what a student gets: the endpoint sends a different feed entirely
const studentDay = {d: 'Wed Sep 2', iso: '2026-09-02', meets: [{
  block: 'Block 1',
  cw: [line([{t: 'Read '}, {t: 'the packet', url: 'https://x/p'}]),
       line([{t: 'Draft quiz', held: 1}])],
  hw: null}]};
render({ok: true, course: {tag: 'P1', name: 'AP Phys'}, updated: '',
        weeks: [{label: 'W', mon: '2026-08-31', days: [studentDay]}]});
out = document.getElementById('app').innerHTML;
console.log('');
console.log('--- student ---');
console.log('no staff banner     :', !/Staff view/.test(out));
console.log('released link works :', out.includes('https://x/p'));
console.log('held link has no url:', !out.includes('https://x/q'));
console.log('private line absent :', !out.includes('copies made'));
console.log('day note absent     :', !out.includes('Faculty Mtg'));

// and the endpoint keeps absences out of both
const gs = fs.readFileSync('apps-script/Sync.gs', 'utf8');
const feed = gs.slice(gs.indexOf('function staffFeed'), gs.indexOf('/* ---------- document titles'));
console.log('');
console.log('staff feed never touches absences:', !/absen/i.test(feed));
console.log('staff feed needs its own token   :',
  /var staff = !!\(q\.k && q\.k === vt\)/.test(gs) &&
  /getProperty\('VIEW_TOKEN'\)/.test(gs) &&
  /if \(q\.k && !vt\)/.test(gs));
console.log('and it is not the write token    :',
  gs.indexOf("getProperty('VIEW_TOKEN')") !== gs.indexOf("getProperty('TOKEN')"));
