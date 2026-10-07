const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem:()=>null, setItem:()=>{}};
let focused = null;
// insertHTML only works when focus is inside the editable, like a real browser
document.execCommand = (cmd, ui, value) => {
  if (cmd !== 'insertHTML') return false;
  const ae = document.activeElement;
  if (!ae || ae.getAttribute('contenteditable') !== 'true') { focused = false; return false; }
  focused = true;
  const sel = dom.window.getSelection();
  if (!sel.rangeCount) return false;
  const r = sel.getRangeAt(0); r.deleteContents();
  const tpl = document.createElement('template'); tpl.innerHTML = value;
  const last = tpl.content.lastChild; r.insertNode(tpl.content);
  if (last) { const a = document.createRange(); a.setStartAfter(last); a.collapse(true);
              sel.removeAllRanges(); sel.addRange(a); }
  return true;
};
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
const cell = [...document.querySelectorAll('.cell.sub[data-f]')].find(c => c.querySelector('a[data-u]'));
openCell(cell);
const before = cell.querySelectorAll('a[data-u]').length;
const a = cell.querySelector('a[data-u]');
const words = a.textContent;
showPop(a);
// blur the cell first, the way clicking a menu button could
document.body.focus();
document.querySelector('#pop [data-act=unlink]').click();
console.log('links before/after  :', before, '->', cell.querySelectorAll('a[data-u]').length);
/* Unlink used to go through execCommand, which did nothing once the cell had
   lost focus and left the button looking dead. It now replaces the anchor
   directly, so what to assert is that it worked WITHOUT focus. */
console.log('works without focus :', focused !== true &&
            cell.querySelectorAll('a[data-u]').length === before - 1);
console.log('words kept          :', cell.textContent.includes(words));
const back = cellLines(cell).filter(Boolean).flatMap(l => l.spans);
console.log('no url in the record:', !back.some(s => s.url === a.dataset.u));
stepBack();
console.log('undo restores link  :', cell.querySelectorAll('a[data-u]').length === before);
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + probe);
