/* Moving round the grid with the keyboard, including cells you cannot type in. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem:()=>null, setItem:()=>{}};
document.execCommand = () => false;
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); byClass = false; winStart = 10; SPAN = 5; render();
const where = () => { const c = current(); if (!c) return 'nowhere';
  const p = gridPos(c); return 'r' + p.r + ' c' + p.c + ' ' + (c.dataset.f || c.className.split(' ')[0]); };

console.log('--- positions are real numbers now ---');
const bad = navAll().filter(x => !Number.isFinite(x.r) || !Number.isFinite(x.c));
console.log('cells with no position :', bad.length);
console.log('navigable cells        :', navAll().length,
            '| of which editable:', allCells().length);

console.log('');
console.log('--- arrows reach cells you cannot type in ---');
select(navAll().find(x => x.el.dataset.f === 'cw').el);
const seen = new Set();
for (let i = 0; i < 12; i++) { move(1, 0); seen.add((current().dataset.f) || 'not-editable'); }
console.log('going down passes through:', [...seen].join(', '));
console.log('  includes a read-only cell:', seen.has('not-editable'));

console.log('');
console.log('--- tab runs across the row ---');
select(allCells().sort((a,b)=>a.r-b.r||a.c-b.c)[0].el);
const cols = [];
for (let i = 0; i < 4; i++) { const p = gridPos(current()); cols.push('r'+p.r+'c'+p.c); step(1); }
console.log('tab visits :', cols.join('  ->  '));
const rows = cols.map(s => s.split('c')[0]);
console.log('same row, rising column:', new Set(rows).size === 1);

console.log('');
console.log('--- the far column slides the window ---');
const startAt = winStart;
const rightmost = navAll().filter(x => x.r === 4).sort((a,b)=>b.c-a.c)[0];
select(rightmost.el);
move(0, 1);
console.log('right from the last day :', startAt, '->', winStart, '(window moved)');
console.log('  landed on the new day :', where());
move(0, -1); move(0, -1); move(0, -1); move(0, -1); move(0, -1);
console.log('back across to the left :', winStart, '(moved back)');

console.log('');
console.log('--- it stops at the ends rather than wrapping ---');
winStart = 0; render();
select(navAll().filter(x => x.r === 4).sort((a,b)=>a.c-b.c)[0].el);
move(0, -1);
console.log('left at the calendar start:', winStart === 0 ? 'stays put' : 'MOVED');

console.log('');
console.log('--- the header keeps its order when a cell closes ---');
winStart = 0; render();
const target = [...document.querySelectorAll(EDITABLE)]
  .find(c => c.dataset.f === 'cw' && recOf(c).course && recOf(c).cw);
const hdrOf = () => document.querySelector('.chd[data-h="' + target.dataset.h + '"]');
const orderOf = h => [...h.children].map(e => e.className).join(' > ');
const before2 = orderOf(hdrOf());
openCell(target); closeCell();
const after2 = orderOf(hdrOf());
console.log('before editing :', before2);
console.log('after closing  :', after2);
console.log('unchanged      :', before2 === after2);

console.log('');
console.log('--- the two header fields are both reachable ---');
winStart = 10; render();
const offFld = document.querySelector('[data-f=off]');
select(offFld);
move(1, 0);
console.log('down from the school line:', current().dataset.f, '(should be note)');
move(-1, 0);
console.log('and back up             :', current().dataset.f, '(should be off)');
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
