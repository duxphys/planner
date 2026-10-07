/* The exact clipboard payload Google Sheets produced for one planner cell.
   Captured from the browser, not reconstructed — two earlier guesses at this
   format both passed their tests and both failed in use. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const CLIP = fs.readFileSync(require('path').join(__dirname,'sheets-clipboard.html'),'utf8');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem:()=>null, setItem:()=>{}};
document.execCommand = (c,u,v) => {
  if (c !== 'insertHTML') return false;
  const sel = dom.window.getSelection(); if (!sel.rangeCount) return false;
  const r = sel.getRangeAt(0); r.deleteContents();
  const t = document.createElement('template'); t.innerHTML = v;
  r.insertNode(t.content); return true;
};
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
const cell = [...document.querySelectorAll('.cell.sub[data-f]')].find(c => !recOf(c)[c.dataset.f]);
openCell(cell);
const sel = window.getSelection(), r = document.createRange();
r.selectNodeContents(cell.firstElementChild || cell); r.collapse(true);
sel.removeAllRanges(); sel.addRange(r);
const ev = new window.Event('paste', {bubbles:true, cancelable:true});
ev.clipboardData = {getData: t => t === 'text/html' ? CLIP : ''};
cell.dispatchEvent(ev);

const ls = cellLines(cell);
console.log('lines: ' + ls.length);
ls.forEach(l => console.log('   ' + (l === null ? '(blank)' :
  (l.bullet ? '- ' : '') + (l.private ? '[private] ' : '') +
  l.spans.map(s => s.t + (s.url ? (s.rel ? ' \\u2192released' : ' \\u2192held') : '')).join(''))));
const spans = ls.filter(Boolean).flatMap(l => l.spans);
console.log('');
console.log('links kept       :', spans.filter(s => s.url).length, '(expect 3)');
console.log('released via *   :', spans.filter(s => s.url && s.rel).length, '(expect 3)');
console.log('asterisks gone   :', !spans.some(s => s.t.includes('*')));
console.log('bullets found    :', ls.filter(l => l && l.bullet).length, '(expect 4)');
console.log('private line     :', ls.some(l => l && l.private && l.spans.map(s=>s.t).join('').includes('59 min')));
console.log('plain parens kept:', spans.some(s => s.t.includes("(We didn")));
console.log('no stray markup  :', !spans.some(s => /<|&#/.test(s.t)));
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') +
     probe.replace('CLIP', JSON.stringify(CLIP)));
