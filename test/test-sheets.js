const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
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
// what Google Sheets actually puts on the clipboard for one cell
const SHEETS = `<meta charset="utf-8"><google-sheets-html-origin>` +
 `<table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0"><colgroup><col width="430"/></colgroup>` +
 `<tbody><tr><td style="padding:2px 3px">Hand Out Course Expectations Signature Sheet<br>` +
 `Start *<a href="https://docs.google.com/document/d/AAA">00.LAB.1a - Lab - I &#10084; Physics!</a><br>` +
 `- *<a href="https://docs.google.com/document/d/BBB">00.LAB.1b - Data Sheet (template)</a><br>` +
 `- <a href="https://docs.google.com/document/d/CCC">Graphical Methods</a><br>` +
 `//copies made<br>` +
 `((1:02 - 1:45 (43 min)))</td></tr></tbody></table>`;
// the same cell, but with real newlines instead of <br> — the other shape
// Sheets uses, and the one that was losing line breaks
const SHEETS_NL = `<meta charset="utf-8"><google-sheets-html-origin>` +
 `<table><tbody><tr><td style="white-space:pre-wrap">` +
 `Hand Out Course Expectations Signature Sheet\nStart *<a href="https://docs.google.com/document/d/AAA">00.LAB.1a - Lab</a>` +
 `\n- *<a href="https://docs.google.com/document/d/BBB">00.LAB.1b - Data Sheet</a>` +
 `\n- <a href="https://docs.google.com/document/d/CCC">Graphical Methods</a>` +
 `\n//copies made\n((1:02 - 1:45 (43 min)))</td></tr></tbody></table>`;
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
const cell = [...document.querySelectorAll('.cell.sub[data-f]')].find(c => !recOf(c)[c.dataset.f]);
openCell(cell);
const sel = window.getSelection(), r = document.createRange();
r.selectNodeContents(cell.firstElementChild || cell); r.collapse(true);
sel.removeAllRanges(); sel.addRange(r);
const ev = new window.Event('paste', {bubbles:true, cancelable:true});
ev.clipboardData = {getData: t => t === 'text/html' ? SHEETS : ''};
cell.dispatchEvent(ev);

const ls = cellLines(cell).filter(Boolean);
console.log('lines           :', ls.length);
ls.forEach(l => console.log('   ' + (l.bullet?'- ':'') + (l.private?'[private] ':'') +
  l.spans.map(s => s.t + (s.url ? (s.rel ? ' <released>' : ' <held>') : '')).join('')));
const spans = ls.flatMap(l => l.spans);
console.log('links kept      :', spans.filter(s => s.url).length, 'of 3');
console.log('released via *  :', spans.filter(s => s.url && s.rel).length, 'of 2');
console.log('asterisks gone  :', !spans.some(s => s.t.includes('*')));
console.log('// line private :', ls.some(l => l.private && l.spans.map(s=>s.t).join('').includes('copies made')));
console.log('(( )) run marked:', spans.some(s => s.priv && s.t.includes('43 min')));
console.log('brackets gone   :', !spans.some(s => s.t.includes('((')));
`;
for (const [name, payload] of [['<br> form', SHEETS], ['newline form', SHEETS_NL]]) {
  console.log('\n=== ' + name + ' ===');
  const dom2 = new JSDOM(html, {pretendToBeVisual:true});
  global.window = dom2.window; global.document = dom2.window.document;
  document.execCommand = (c,u,v) => {
    if (c !== 'insertHTML') return false;
    const sel = dom2.window.getSelection(); if (!sel.rangeCount) return false;
    const r = sel.getRangeAt(0); r.deleteContents();
    const tp = document.createElement('template'); tp.innerHTML = v;
    r.insertNode(tp.content); return true;
  };
  eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') +
       probe.replace('SHEETS', JSON.stringify(payload)));
}
