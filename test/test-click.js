const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem:()=>null, setItem:()=>{}};
global.navigator = dom.window.navigator;
let opened = 0; dom.window.open = () => opened++;
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
const down = el => el.dispatchEvent(new window.MouseEvent('mousedown', {bubbles:true, cancelable:true}));

const cells = [...document.querySelectorAll('.cell.sub[data-f]')];
// click on a LINK inside a closed cell -- the reported failure
const cell = cells.find(c => c.querySelector('a[data-u]'));
down(cell.querySelector('a[data-u]'));
console.log('clicked a link in a closed cell -> editing that cell:', editing === cell,
            '| new tabs opened:', opened,
            '| link menu shown:', document.getElementById('pop').classList.contains('on'));

// click on plain text in a different cell
const other = cells.find(c => c !== cell && recOf(c).course);
down(other.querySelector('.ln') || other);
console.log('clicked text in another cell   -> editing that cell:', editing === other);

// every editable cell can be reached
let reached = 0;
for (const c of cells) { closeCell(); down(c.firstElementChild || c); if (editing === c) reached++; }
console.log('cells reachable by click:', reached + '/' + cells.length);

// class view: no two cells sharing a grid slot
closeCell(); byClass = true; render();
const slots = new Map();
for (const el of document.querySelectorAll('#app .grid > div')) {
  const k = el.style.gridColumn + '|' + el.style.gridRow;
  slots.set(k, (slots.get(k) || 0) + 1);
}
const clashes = [...slots.entries()].filter(([, n]) => n > 1);
console.log('class view overlapping cells:', clashes.length);
const cc = [...document.querySelectorAll('.cell.sub[data-f]')];
let r2 = 0;
for (const c of cc) { closeCell(); down(c.firstElementChild || c); if (editing === c) r2++; }
console.log('class-view cells reachable:', r2 + '/' + cc.length);
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + probe);
