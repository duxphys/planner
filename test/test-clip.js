const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem:()=>null, setItem:()=>{}};
const done = [];
document.execCommand = (cmd, ui, value) => {
  if (cmd === 'copy' || cmd === 'cut') { done.push(cmd); return true; }
  if (cmd !== 'insertHTML') return false;
  const sel = dom.window.getSelection();
  if (!sel.rangeCount) return false;
  const r = sel.getRangeAt(0); r.deleteContents();
  const tpl = document.createElement('template'); tpl.innerHTML = value;
  const last = tpl.content.lastChild; r.insertNode(tpl.content);
  if (last) { const a = document.createRange(); a.setStartAfter(last); a.collapse(true);
              sel.removeAllRanges(); sel.addRange(a); }
  return true;
};
Object.defineProperty(globalThis, 'navigator',
  {value: {platform:'Win32', userAgent:'x', clipboard:null}, configurable:true, writable:true});
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
const tap = (k, o={}) => { const ev = new window.KeyboardEvent('keydown',
  {key:k, bubbles:true, cancelable:true, ...o}); document.body.dispatchEvent(ev);
  return ev.defaultPrevented; };
const cells = [...document.querySelectorAll('.cell.sub[data-f]')];
select(cells.find(c => (recOf(c)[c.dataset.f]||[]).length));

for (const mod of ['ctrlKey','metaKey']) {
  done.length = 0; closeCell();
  tap('c', {[mod]: true});
  console.log((mod.replace('Key','') + '+c copies').padEnd(22), ':', done.join() === 'copy');
  done.length = 0; closeCell();
  tap('x', {[mod]: true});
  console.log((mod.replace('Key','') + '+x cuts').padEnd(22), ':', done.join() === 'cut');
}
done.length = 0; closeCell();
console.log('alt+c left to the Mac :', !tap('c', {altKey:true}) && !done.length);
console.log('alt+v left alone      :', !tap('v', {altKey:true}));
console.log('shift+c left alone    :', !tap('c', {shiftKey:true}));

// paste must NOT be intercepted, or the browser's own paste never fires
closeCell();
const target = cells.find(c => (recOf(c)[c.dataset.f]||[]).length);
select(target);
const blocked = tap('v', {ctrlKey:true});
console.log('ctrl+v not blocked    :', !blocked);
console.log('ctrl+v opened the cell:', editing === target);
closeCell(); select(target);
console.log('cmd+v not blocked     :', !tap('v', {metaKey:true}));
console.log('no bubble shown       :', !document.getElementById('pop').classList.contains('on'));
`;
global.done = done;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + probe);
