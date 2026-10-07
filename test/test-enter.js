const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem:()=>null, setItem:()=>{}};
global.navigator = dom.window.navigator;
// jsdom has no execCommand; emulate insertHTML so save paths can be exercised
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
const cell = [...document.querySelectorAll('.cell.sub[data-f]')].find(c => c.querySelector('a[data-u]'));
openCell(cell);
const a = cell.querySelector('a[data-u]');
const url = a.dataset.u;
showPop(a);
const p = document.getElementById('pop');
p.querySelector('[data-act=edit]').click();
p.querySelector('.tx').value = 'Renamed by hand';

const press = k => p.querySelector('.tx').dispatchEvent(
  new window.KeyboardEvent('keydown', {key: k, bubbles: true, cancelable: true}));
press('Enter');

console.log('panel closed          :', !p.classList.contains('on'));
const fresh = cell.querySelector('a[data-u]');
console.log('text changed          :', JSON.stringify(fresh.textContent));
console.log('url preserved         :', fresh.dataset.u === url);
const rec = cellLines(cell).filter(Boolean).flatMap(l => l.spans).find(s => s.url === url);
console.log('saved into the record :', JSON.stringify(rec && rec.t));

// escape backs out without changing anything
showPop(fresh);
p.querySelector('[data-act=edit]').click();
p.querySelector('.tx').value = 'should not stick';
press('Escape');
console.log('escape closed panel   :', !p.classList.contains('on'));
console.log('escape left text alone:', JSON.stringify(cell.querySelector('a[data-u]').textContent));
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + probe);
