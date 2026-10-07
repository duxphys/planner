/* Undo has only ever been tested by calling stepBack() directly. This drives it
   from the keyboard, which is the path that actually matters. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem:()=>null, setItem:()=>{}};
document.execCommand = () => false;
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
const tap = (k, o={}) => { const ev = new window.KeyboardEvent('keydown',
  {key:k, bubbles:true, cancelable:true, ...o});
  (editing || document.body).dispatchEvent(ev); return ev.defaultPrevented; };

const cell = [...document.querySelectorAll('.cell.sub[data-f]')].find(c => c.querySelector('a[data-u]'));
openCell(cell);
const n0 = cell.querySelectorAll('a[data-u]').length;
showPop(cell.querySelector('a[data-u]'));
document.querySelector('#pop [data-act=unlink]').click();
console.log('link removed        :', cell.querySelectorAll('a[data-u]').length === n0 - 1);

console.log('ctrl+z was handled  :', tap('z', {ctrlKey:true}));
console.log('ctrl+z restored it  :', cell.querySelectorAll('a[data-u]').length === n0);
console.log('ctrl+shift+z redoes :', tap('z', {ctrlKey:true, shiftKey:true}) &&
            cell.querySelectorAll('a[data-u]').length === n0 - 1);
console.log('cmd+z works too     :', tap('z', {metaKey:true}) &&
            cell.querySelectorAll('a[data-u]').length === n0);
console.log('ctrl+y redoes       :', tap('y', {ctrlKey:true}) &&
            cell.querySelectorAll('a[data-u]').length === n0 - 1);

// the sequence that actually happens: unlink, click away, then undo
console.log('');
closeCell();
const saved = JSON.stringify(recOf(cell)[cell.dataset.f]);
openCell(cell);
const n1 = cell.querySelectorAll('a[data-u]').length;
showPop(cell.querySelector('a[data-u]'));
document.querySelector('#pop [data-act=unlink]').click();
closeCell();
console.log('after unlink + close:', cell.querySelectorAll('a[data-u]').length, 'links');
tap('z', {ctrlKey:true});
console.log('ctrl+z on a closed cell restores it:',
            cell.querySelectorAll('a[data-u]').length === n1);
console.log('model restored too  :', JSON.stringify(recOf(cell)[cell.dataset.f]) === saved);
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
