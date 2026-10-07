/* The link panel has two sizes — the icon row, and the row plus the edit
   fields. Measuring once while it was narrow let the expanded panel run off the
   side of the screen. It must be placed again whenever it changes size, and
   clamped to the window on both axes. */
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

/* jsdom does no layout, so the geometry is supplied here. NARROW is the icon
   row on its own; WIDE is the panel with the text and address fields. */
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
const VW = 1000, VH = 700, NARROW = 150, WIDE = 420, H = 40, TALL = 120;
Object.defineProperty(document.documentElement, 'clientWidth',  {get:()=>VW, configurable:true});
Object.defineProperty(document.documentElement, 'clientHeight', {get:()=>VH, configurable:true});

let popW = NARROW, popH = H;
Object.defineProperty(pop(), 'offsetWidth',  {get:()=>popW, configurable:true});
Object.defineProperty(pop(), 'offsetHeight', {get:()=>popH, configurable:true});

const cell = [...document.querySelectorAll('.cell.sub[data-f]')].find(c => c.querySelector('a[data-u]'));
openCell(cell);
const a = cell.querySelector('a[data-u]');
const linkAt = (left, top) => { a.getBoundingClientRect = () => (
  {left, top, right:left+120, bottom:top+18, width:120, height:18}); };
const L = () => parseFloat(pop().style.left);
const T = () => parseFloat(pop().style.top);

console.log('--- the panel stays on screen when it expands ---');
linkAt(820, 100); popW = NARROW; showPop(a);
const narrowLeft = L();
console.log('narrow, near the right edge :', narrowLeft, '(fits: ' + (narrowLeft + NARROW <= VW) + ')');
popW = WIDE; placePop();
console.log('then the fields open        :', L(), '(fits: ' + (L() + WIDE <= VW) + ')');
console.log('  it moved to make room     :', L() < narrowLeft);

console.log('');
console.log('--- and off the left edge ---');
linkAt(4, 100); popW = WIDE; showPop(a);
console.log('link hard against the left  :', L(), '(>= 8: ' + (L() >= 8) + ')');

console.log('');
console.log('--- wider than the window ---');
linkAt(500, 100); popW = 1200; showPop(a);
console.log('panel wider than the screen :', L(), '(pinned to the left edge: ' + (L() === 8) + ')');

console.log('');
console.log('--- no room below ---');
popW = WIDE; popH = TALL;
linkAt(300, 100); showPop(a);
const roomy = T();
linkAt(300, 640); showPop(a);
console.log('room below  -> sits below   :', roomy > 100);
console.log('none below  -> flips above  :', T() < 640, '(top ' + T() + ')');
console.log('  and stays on screen       :', T() >= 8);

console.log('');
console.log('--- opening the fields repositions, every time ---');
console.log('placePop is called on expand:',
  /add\\('editing'\\);\\s*\\n\\s*placePop\\(\\)/.test(require('fs').readFileSync('editor.js','utf8')));
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
