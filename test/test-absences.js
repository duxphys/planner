/* Absences: read-only, teacher-only, and never written to this machine. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
const mem = {};
global.localStorage = {getItem: k => k in mem ? mem[k] : null, setItem: (k,v) => mem[k]=String(v)};
Object.defineProperty(globalThis, 'navigator', {value:{platform:'Test'}, configurable:true});
document.execCommand = () => false;
const sent = [];
global.fetch = async (url, opt) => {
  const req = JSON.parse(opt.body);
  sent.push(req.action);
  if (req.action === 'absences') return {json: async () => ({ok:true, byTag: {
    P1: {'9/2': {AB: ['N Emami', 'R Choi'], T: ['J Park']}, '9/3': {}},
    P5: {'9/2': {TE: ['S Ali']}}
  }})};   // 9/3 taken, nobody out.  P2 never reported: not taken.
  return {json: async () => ({ok:true, now:new Date().toISOString(), records:[], saved:[], conflicts:[]})};
};
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
loadSync(); cfg.url = 'https://fake/exec'; cfg.token = 'good';

(async () => {
  await pullAbsences();
  const grid = () => document.getElementById('app').innerHTML;

  console.log('P1 absences shown   :', /AB: N Emami, R Choi/.test(grid()));
  console.log('lateness shown too  :', /T: J Park/.test(grid()));
  const oneLine = grid().indexOf('AB: N Emami, R Choi');
  console.log('on its own line     :',
    grid().slice(oneLine, oneLine + 60).indexOf('T: J Park') > 0 &&
    grid().slice(oneLine, oneLine + 60).indexOf('div') > 0);
  console.log('taken, nobody out   :', /All here/.test(grid()));
  // P2 was never reported, so its absence cell must be empty — not a dash
  const p2 = WEEKS[0].days.findIndex(d => d.iso === '2026-09-02');
  const bi = WEEKS[0].days[p2].blocks.findIndex(b => b.course && b.period === 2 && !b.asp);
  const cellP2 = [...document.querySelectorAll('.cell.sub.abs')].find(c =>
    c.style.gridColumn === String(p2 + 2));
  console.log('not taken -> blank  :', absText('2026-09-02', 2) === '');
  console.log('taken+clear is not blank:', absText('2026-09-03', 1) !== '');
  console.log('P5 on the same day  :', /TE: S Ali/.test(grid()));
  const cell = document.querySelector('.abs');
  console.log('they sit in Absent  :', /AB:|T:|TE:/.test(document.querySelector('.cell.sub.abs').textContent) ||
    [...document.querySelectorAll('.cell.sub.abs')].some(c => /AB:/.test(c.textContent)));

  console.log('');
  console.log('never editable      :', [...document.querySelectorAll('.cell.sub.abs')].every(c => !c.dataset.f));
  console.log('never pushed        :', !sent.includes('push'));

  student = true; render();
  console.log('absent from student view:', !/N Emami|J Park|S Ali/.test(grid()));
  student = false; render();

  saveSync();
  const disk = localStorage.getItem('planner.sync.v1');
  console.log('no names on disk    :', !/Emami|Choi|Park|Ali/.test(disk));
  console.log('not even the key    :', !('absent' in JSON.parse(disk)));

  // class view too
  byClass = true; render();
  console.log('class view shows them   :', /AB: N Emami/.test(grid()));

  // a gradebook that cannot be read must SAY so, not look like a quiet day
  byClass = false;
  const good = global.fetch;
  global.fetch = async (u, o) => {
    const req = JSON.parse(o.body);
    if (req.action === 'absences') return {json: async () => ({ok:false, error:'no gradebook set up'})};
    return {json: async () => ({ok:true, now:'X', records:[], saved:[], conflicts:[]})};
  };
  absent = {}; absentNote = '';
  try { await pullAbsences(); } catch (e) { absentNote = 'Absences unavailable: ' + e.message; }
  render();
  console.log('');
  console.log('failure is announced    :', /Absences unavailable/.test(document.getElementById('classbar').innerHTML));

  // an empty reply is not the same as a broken one, and must say so
  global.fetch = async (u, o) => {
    const req = JSON.parse(o.body);
    if (req.action === 'absences') return {json: async () => ({ok:true, byTag:{}})};
    return {json: async () => ({ok:true, now:'X', records:[], saved:[], conflicts:[]})};
  };
  await pullAbsences();
  console.log('empty reply is reported :', /No attendance found/.test(document.getElementById('classbar').innerHTML));
  // the two messages were merged: one line that also says what to go and fix
  console.log('and says what to fix    :', /Gradebook tab mapping/.test(document.getElementById('classbar').innerHTML));
  global.fetch = good;
})();
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
