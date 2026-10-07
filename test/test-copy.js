const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem:()=>null, setItem:()=>{}};
global.navigator = dom.window.navigator;
document.execCommand = (cmd, ui, value) => {
  if (cmd !== 'insertHTML') return false;
  const sel = dom.window.getSelection();
  if (!sel.rangeCount) return false;
  const r = sel.getRangeAt(0);
  r.deleteContents();
  const tpl = document.createElement('template');
  tpl.innerHTML = value;
  const last = tpl.content.lastChild;
  r.insertNode(tpl.content);
  if (last) { const a = document.createRange(); a.setStartAfter(last); a.collapse(true);
              sel.removeAllRanges(); sel.addRange(a); }
  return true;
};
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
const cells = [...document.querySelectorAll('.cell.sub[data-f]')];
const summarise = ls => ({
  lines: ls.length,
  blanks: ls.filter(l => !l).length,
  bullets: ls.filter(l => l && l.bullet).length,
  links: ls.filter(Boolean).flatMap(l => l.spans).filter(s => s.url).length,
  released: ls.filter(Boolean).flatMap(l => l.spans).filter(s => s.url && s.rel).length
});

// a rich source: bullets, links, blank lines
const src = cells.find(c => {
  const ls = recOf(c)[c.dataset.f] || [];
  return ls.some(l => l && l.bullet) && ls.filter(Boolean).some(l => l.spans.some(s => s.url));
});
const source = recOf(src)[src.dataset.f];
console.log('source :', JSON.stringify(summarise(source)));

const fakePaste = (target, clipHTML) => {
  openCell(target);
  const sel = window.getSelection(), r = document.createRange();
  // caret INSIDE a line div, which is where it really sits when you click
  const ln = target.querySelector('.ln') || target;
  r.selectNodeContents(ln); r.collapse(true);
  sel.removeAllRanges(); sel.addRange(r);
  const ev = new window.Event('paste', {bubbles:true, cancelable:true});
  ev.clipboardData = {getData: t => t === 'text/html' ? clipHTML : ''};
  target.dispatchEvent(ev);
  return cellLines(target);
};

// 1. copied from an OPEN cell (marker form)
const dest1 = cells.find(c => c !== src && recOf(c).course && !recOf(c)[c.dataset.f]);
const openForm = editHTML(source);
console.log('from open cell  :', JSON.stringify(summarise(fakePaste(dest1, openForm))));

// 2. copied from a CLOSED cell (rendered form, bullets are CSS)
closeCell();
const dest2 = cells.find(c => c !== src && c !== dest1 && recOf(c).course && !recOf(c)[c.dataset.f]);
const closedForm = lines(source);
console.log('from closed cell:', JSON.stringify(summarise(fakePaste(dest2, closedForm))));

// 3. the wrapper's own newlines must not become blank lines at the top
closeCell();
const destA = cells.find(c => ![src].includes(c) && recOf(c).course && !recOf(c)[c.dataset.f]);
const NL = String.fromCharCode(10);
const wrapped = "<meta charset='utf-8'>" + NL + "<!--StartFragment-->" + NL +
                openForm + NL + "<!--EndFragment-->" + NL;
const backA = fakePaste(destA, wrapped);
// the source itself has a blank at index 1, so compare shapes rather than guess
const shape = ls => ls.map(l => l === null ? '_' : 'x').join('');
console.log('no wrapper blanks    :', backA[0] !== null &&
            shape(backA) === shape(source),
            '| got', shape(backA), 'want', shape(source));

// 4. exactly what Chrome puts on the clipboard: wrapper + fragment comments
closeCell();
const dest3 = cells.find(c => ![src,dest1,dest2].includes(c) && recOf(c).course && !recOf(c)[c.dataset.f]);
const chrome = "<meta charset='utf-8'><!--StartFragment-->" + openForm + "<!--EndFragment-->";
console.log('chrome clipboard:', JSON.stringify(summarise(fakePaste(dest3, chrome))));

// 4. pasting into a cell that already has content keeps what was there
closeCell();
const dest4 = cells.find(c => ![src,dest1,dest2,dest3].includes(c) && (recOf(c)[c.dataset.f]||[]).length);
const had = summarise(recOf(dest4)[dest4.dataset.f]);
const now = summarise(fakePaste(dest4, openForm));
console.log('into a full cell: had', had.lines, 'lines ->', now.lines,
            '| expected', had.lines + summarise(source).lines);
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + probe);
