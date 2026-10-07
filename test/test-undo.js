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
const sig = c => JSON.stringify(cellLines(c));
const caretIn = c => { const sel = window.getSelection(), r = document.createRange();
  const ln = c.querySelector('.ln') || c; r.selectNodeContents(ln); r.collapse(true);
  sel.removeAllRanges(); sel.addRange(r); };
const paste = (c, clipHTML) => { caretIn(c);
  const ev = new window.Event('paste', {bubbles:true, cancelable:true});
  ev.clipboardData = {getData: t => t === 'text/html' ? clipHTML : ''};
  c.dispatchEvent(ev); };

// --- multi-line paste, the case the browser could not undo ---
const src = cells.find(c => (recOf(c)[c.dataset.f]||[]).length > 3);
const clip = editHTML(recOf(src)[src.dataset.f]);
const dest = cells.find(c => c !== src && recOf(c).course && (recOf(c)[c.dataset.f]||[]).length);
openCell(dest);
const before = sig(dest);
paste(dest, clip);
console.log('paste changed the cell :', sig(dest) !== before);
stepBack();
console.log('undo restored it       :', sig(dest) === before);
stepForward();
console.log('redo re-applied it     :', sig(dest) !== before);
stepBack();

// --- removing a link ---
const withLink = cells.find(c => (recOf(c)[c.dataset.f]||[]).some(l => l && l.spans.some(s=>s.url)));
openCell(withLink);
const b2 = sig(withLink);
const n0 = withLink.querySelectorAll('a[data-u]').length;
showPop(withLink.querySelector('a[data-u]'));
document.querySelector('#pop [data-act=unlink]').click();
console.log('unlink dropped a link  :', withLink.querySelectorAll('a[data-u]').length === n0 - 1);
stepBack();
console.log('undo brought it back   :', sig(withLink) === b2);

// --- releasing a link ---
const a = withLink.querySelector('a[data-u]');
const r0 = a.dataset.r;
showPop(a);
document.querySelector('#pop [data-act=rel]').click();
console.log('release flipped flag   :', withLink.querySelector('a[data-u]').dataset.r !== r0);
stepBack();
console.log('undo flipped it back   :', withLink.querySelector('a[data-u]').dataset.r === r0);

// --- typing coalesces into one step ---
const c3 = cells.find(c => recOf(c).course && (recOf(c)[c.dataset.f]||[]).length);
openCell(c3);
const b3 = sig(c3);
const depth = past.length;
for (const ch of 'hello') {
  c3.dispatchEvent(new window.Event('beforeinput', {bubbles:true}));
  const ln = c3.querySelector('.ln'); ln.textContent += ch;
}
console.log('five keystrokes ->', past.length - depth, 'undo step');
stepBack();
console.log('undo cleared the typing:', sig(c3) === b3);

// --- undo reaches a cell that is no longer open ---
openCell(dest);
const b4 = sig(dest);
paste(dest, clip);
closeCell();
console.log('closed cell changed    :', JSON.stringify(recOf(dest)[dest.dataset.f]) !== b4);
stepBack();
console.log('undo works when closed :', JSON.stringify(recOf(dest)[dest.dataset.f] || []) === b4);
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + probe);
