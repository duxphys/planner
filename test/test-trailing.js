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
const cells = [...document.querySelectorAll('.cell.sub[data-f]')];

// find a cell whose line ENDS in a link
const cell = cells.find(c => (recOf(c)[c.dataset.f]||[])
  .some(l => l && l.spans.length && l.spans[l.spans.length-1].url));
openCell(cell);
const lastLink = [...cell.querySelectorAll('a[data-u]')]
  .find(a => a.parentNode.lastChild !== a ? false : true) ||
  [...cell.querySelectorAll('a[data-u]')].find(a => a.nextSibling && a.nextSibling.nodeType === 3);
const line = [...cell.querySelectorAll('.ln')].find(d => {
  const k = d.childNodes[d.childNodes.length-1];
  return k && k.nodeType === 3 && k.nodeValue === '\\u200B';
});
console.log('trailing link has a caret slot after it:', !!line);

// type into that slot the way a keystroke would
const slot = line.childNodes[line.childNodes.length-1];
const anchor = line.querySelector('a[data-u]');
slot.nodeValue += 'and then this';
console.log('typed text stayed out of the link      :', anchor.textContent.indexOf('and then this') === -1);

const back = cellLines(cell);
const joined = back.filter(Boolean).map(l => l.spans.map(s=>s.t).join('')).join('|');
console.log('zero-width holders stripped from data  :', joined.indexOf('\\u200B') === -1);
console.log('typed text survived into the record    :', joined.indexOf('and then this') !== -1);
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + probe);
