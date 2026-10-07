/* The link menu must work with NO execCommand at all — that is the whole point
   of the change. If any of these need it, the browser can refuse and the button
   goes dead with no error. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem:()=>null, setItem:()=>{}};
let used = 0;
document.execCommand = () => { used++; return false; };   // always refuses, like a bad focus state
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
const cell = [...document.querySelectorAll('.cell.sub[data-f]')].find(c => c.querySelector('a[data-u]'));
const click = act => document.querySelector('#pop [data-act=' + act + ']').click();

// --- unlink ---
openCell(cell);
const n0 = cell.querySelectorAll('a[data-u]').length;
let a = cell.querySelector('a[data-u]');
const words = a.textContent, url = a.dataset.u;
showPop(a);
document.body.focus();                       // focus deliberately elsewhere
click('unlink');
console.log('unlink removed the link :', cell.querySelectorAll('a[data-u]').length === n0 - 1);
console.log('words survived          :', cell.textContent.includes(words));
console.log('url gone from the record:', !cellLines(cell).filter(Boolean).flatMap(l => l.spans).some(s => s.url === url));
stepBack();
console.log('undo restores it        :', cell.querySelectorAll('a[data-u]').length === n0);

// --- release toggle ---
a = cell.querySelector('a[data-u]');
const before = a.dataset.r;
showPop(a); document.body.focus(); click('rel');
console.log('release flipped         :', cell.querySelector('a[data-u]').dataset.r !== before);
stepBack();
console.log('undo flips it back      :', cell.querySelector('a[data-u]').dataset.r === before);

// --- edit text and url ---
a = cell.querySelector('a[data-u]');
showPop(a); click('edit');
document.getElementById('pop').querySelector('.tx').value = 'New name';
document.getElementById('pop').querySelector('.ur').value = 'https://x.test/new';
document.body.focus();
click('save');
const now = cell.querySelector('a[data-u]');
console.log('text changed            :', now.textContent === 'New name');
console.log('url changed             :', now.dataset.u === 'https://x.test/new');

console.log('');
console.log('execCommand calls made  :', used, '(must be 0)');
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
