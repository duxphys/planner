const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem:()=>null, setItem:()=>{}};
document.execCommand = () => true;
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
const cell = [...document.querySelectorAll('.cell.sub[data-f]')].find(c => !recOf(c)[c.dataset.f]);
const txt = ls => ls.map(l => l ? (l.private ? '//' : '') + l.spans.map(s => s.t).join('') : '~');

// type a private note, break the line, type more
openCell(cell);
cell.innerHTML = '<div class="ln">// hidden note</div>';
const ln = cell.firstElementChild;
const sel = window.getSelection(), r = document.createRange();
r.setStart(ln.firstChild, ln.firstChild.nodeValue.length); r.collapse(true);
sel.removeAllRanges(); sel.addRange(r);
newLine();
window.getSelection().getRangeAt(0).startContainer.appendChild
  ? cell.lastElementChild.textContent = 'visible text'
  : null;
const out = cellLines(cell);
console.log('two lines           :', out.length === 2, JSON.stringify(txt(out)));
console.log('first stays private :', out[0].private === true);
console.log('second is NOT private:', out[1] && out[1].private === false);

// a stray <br> must still split, not merge
const el = document.createElement('div');
el.innerHTML = '<div class="ln">// hidden<br>after the break</div>';
const back = cellLines(el);
console.log('br splits the line  :', back.length === 2, JSON.stringify(txt(back)));
console.log('text after br is visible:', back[1] && back[1].private === false);

// a div holding only a br is one blank line, not two
const el2 = document.createElement('div');
el2.innerHTML = '<div class="ln">one</div><div class="ln"><br></div><div class="ln">two</div>';
console.log('blank line stays one:', cellLines(el2).length === 3);

// ctrl-return and shift-return both reach newLine
let made = 0;
const realNewLine = newLine;
for (const mod of ['ctrlKey','shiftKey','metaKey']) {
  openCell(cell);
  const before = cell.children.length;
  const rr = document.createRange();
  rr.selectNodeContents(cell.firstElementChild); rr.collapse(false);
  window.getSelection().removeAllRanges(); window.getSelection().addRange(rr);
  const ev = new window.KeyboardEvent('keydown', {key:'Enter', bubbles:true, cancelable:true, [mod]:true});
  document.body.dispatchEvent(ev);
  if (cell.children.length === before + 1 && ev.defaultPrevented) made++;
}
console.log('ctrl/shift/cmd return all make a line:', made === 3);
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
