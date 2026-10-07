const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem:()=>null, setItem:()=>{}};
global.navigator = dom.window.navigator;
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
const cell = [...document.querySelectorAll('.cell.sub[data-f]')].find(c => c.querySelector('a[data-u]'));
openCell(cell);
const a = cell.querySelector('a[data-u]');
caretAfter(a);
const sel = window.getSelection(), r = sel.getRangeAt(0);
console.log('caret container is a text node:', r.startContainer.nodeType === 3);
console.log('caret is outside the anchor    :', !a.contains(r.startContainer));
console.log('caret sits after the anchor    :', a.nextSibling === r.startContainer);

// type there, the way a keystroke would land
r.startContainer.nodeValue += ' then this';
console.log('typed text stayed out of link  :', a.textContent.indexOf('then this') === -1);

const back = cellLines(cell);
const joined = back.filter(Boolean).map(l => l.spans.map(s => s.t).join('')).join('\\n');
console.log('zero-width space stripped      :', joined.indexOf('\\u200B') === -1);
console.log('typed text kept in the record  :', joined.indexOf('then this') !== -1);
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + probe);
