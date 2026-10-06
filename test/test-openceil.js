/* The three ways an open cell used to lose work, and the one undo lost.
 *
 * All four were invisible until the suite could fail (6 Oct 2026):
 *   1. nothing committed an open cell when the page went away
 *   2. a background render() rebuilt the grid and orphaned the open cell
 *   3. a pull advanced the open cell's base, disarming the version guard
 *   4. undo and redo changed the record but never queued the change
 *
 * Each check below is written so that removing the fix makes it fail, not so
 * that it reads the code and agrees with itself.
 */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true, url:'https://x.test/'});
global.window = dom.window; global.document = dom.window.document;

/* a localStorage that records whether the queue reached disk, and when */
let disk = {};
let writes = 0;
global.localStorage = {
  getItem: k => (k in disk ? disk[k] : null),
  setItem: (k, v) => { disk[k] = String(v); writes++; },
  removeItem: k => { delete disk[k]; }
};
document.execCommand = () => false;
const load = f => fs.readFileSync(f,'utf8');

const probe = `
loadPrefs(); wireToolbar(); wireEditor(); winStart = 0; byClass = false; hidePrep = false;
cfg.url = 'https://endpoint.test/exec'; cfg.token = 't';

/* The stub has to exist before the FIRST commit, not just before section 3.
   Without it, section 2's closeCell started a flush against the real network,
   which left syncing true and silently swallowed every later flush — so the
   section 3 assertions reported "no push" for the wrong reason. */
let pullRecords = [], pushed = null;
global.fetch = window.fetch = async (url, o) => {
  const req = JSON.parse(o.body);
  if (req.action === 'pull') {
    return {json: async () => ({ok:true, now:'T2', records: pullRecords})};
  }
  if (req.action === 'push') {
    pushed = req.records[0];
    return {json: async () => ({ok:true, now:'T3', saved:[], conflicts:[]})};
  }
  return {json: async () => ({ok:true, now:'T3', records:[], saved:[], conflicts:[]})};
};

render();

const text = t => [{bullet:false, private:false, spans:[{t, url:null, rel:false, priv:false}]}];
const flat = ls => (ls || []).map(l => l.spans.map(s => s.t).join('')).join(' ');
const anyCell = () => document.querySelector('.cell.sub[data-f=cw]');
const keyOf = c => recKey(c.dataset.w, c.dataset.d, c.dataset.bi, c.dataset.f);
const clearQ = () => { for (const k of Object.keys(queue)) delete queue[k]; };

/* ---------- 1. the page goes away with a cell open ---------- */
console.log('--- 1. closing the tab with a cell open ---');
let cell = anyCell();
openCell(cell);
cell.innerHTML = '';
cell.appendChild(document.createTextNode('Typed and never closed'));
clearQ();
const before = writes;
console.log('cell is open             :', isEditing() === true);
console.log('and nothing is queued yet:', Object.keys(queue).length === 0);

window.dispatchEvent(new window.Event('beforeunload'));
const k1 = keyOf(cell);
console.log('beforeunload queues it   :', queue[k1] !== undefined);
console.log('  with the typed text    :', flat(queue[k1]) === 'Typed and never closed');
/* The disk write is the part that matters: the page may never come back, so a
   queue that only exists in memory is no better than no queue. saveSync runs
   synchronously inside closeCell, so by the time the event handler returns the
   text is already on disk. */
const onDisk = () => JSON.parse(disk['planner.sync.v1'] || '{}').queue || {};
console.log('  and it reached disk    :', writes > before && onDisk()[k1] !== undefined);
console.log('  before the handler returned :', onDisk()[k1] !== undefined &&
            flat(onDisk()[k1]) === 'Typed and never closed');

/* pagehide and visibilitychange cover the cases beforeunload does not */
for (const [name, fire] of [
  ['pagehide', () => window.dispatchEvent(new window.Event('pagehide'))],
  ['visibilitychange', () => {
     Object.defineProperty(document, 'visibilityState', {value:'hidden', configurable:true});
     document.dispatchEvent(new window.Event('visibilitychange'));
   }]
]) {
  clearQ();
  cell = anyCell();
  openCell(cell);
  cell.innerHTML = '';
  cell.appendChild(document.createTextNode('via ' + name));
  fire();
  console.log('  ' + name.padEnd(18) + ' also commits :',
              flat(queue[keyOf(cell)]) === 'via ' + name);
}

/* ---------- 2. a background render must not eat the open cell ---------- */
console.log('');
console.log('--- 2. a background render while typing ---');
clearQ();
cell = anyCell();
openCell(cell);
cell.innerHTML = '';
cell.appendChild(document.createTextNode('Half a sentence'));
const node = cell;
render();                                    // what the 'online' event does
console.log('the cell survives render :', document.contains(node) && editing === node);
console.log('  text still on screen   :', /Half a sentence/.test(node.textContent));
closeCell();
console.log('  and the render happened once the cell closed :',
            !document.contains(node) || document.querySelectorAll('.grid').length === 1);
console.log('  text was committed     :', flat(queue[keyOf(node)]) === 'Half a sentence');

/* ---------- 3. a pull must not touch the open cell's version ---------- */
console.log('');
console.log('--- 3. the version guard covers an open cell ---');
clearQ();
cell = anyCell();
const k3 = keyOf(cell);
base[k3] = 'T1';                             // what this machine last saw
openCell(cell);
cell.innerHTML = '';
cell.appendChild(document.createTextNode('My edit'));

// the server has moved on: another machine saved this very record at T2
pullRecords = [{key:k3, updatedAt:'T2', device:'other-pc', lines:text('Their edit')}];

(async () => {
  // let any flush started by the sections above finish, or syncing blocks ours
  for (let i = 0; i < 100 && syncing; i++) await new Promise(r => setTimeout(r, 5));
  pushed = null;
  await pullNow();
  console.log('base was NOT advanced    :', base[k3] === 'T1', '(' + base[k3] + ')');
  closeCell();                               // this starts a flush of its own
  for (let i = 0; i < 100 && !pushed; i++) await new Promise(r => setTimeout(r, 5));
  /* !! on purpose: "pushed && ..." yields null when pushed is null, and null
     is not false, so the assertion would slip past strict.js as a non-verdict.
     A verdict has to BE a boolean. */
  console.log('a push actually went out      :', !!pushed);
  console.log('the push carries the old base :', !!pushed && pushed.base === 'T1',
              pushed ? '(' + pushed.base + ')' : '');
  console.log('  so the server can refuse it :', !!pushed && pushed.base !== 'T2');

  /* ---------- 4. undo and redo must queue ---------- */
  console.log('');
  console.log('--- 4. undo reaches the queue ---');
  clearQ();
  const c4 = anyCell();
  const k4 = keyOf(c4);
  const rec = recOf(c4), f = fieldOf(c4);
  rec[f] = text('Read chapter 4');
  c4.innerHTML = lines(rec[f]);

  openCell(c4);
  mark(c4);                                  // what typing does
  c4.innerHTML = '';
  c4.appendChild(document.createTextNode('Read chapter 5'));
  closeCell();
  console.log('typing queued the new text :', flat(queue[k4]) === 'Read chapter 5');

  stepBack();                                // ctrl+Z
  console.log('undo restored the record   :', flat(recOf(c4)[fieldOf(c4)]) === 'Read chapter 4');
  console.log('and the QUEUE agrees       :', flat(queue[k4]) === 'Read chapter 4');
  console.log('  (it used to still say "Read chapter 5", and that is what published)');

  stepForward();                             // ctrl+Y
  console.log('redo also queues           :', flat(queue[k4]) === 'Read chapter 5');
})();
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
