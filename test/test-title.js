/* Pasting a bare Drive link should label itself with the document's name. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
const mem = {};
global.localStorage = {getItem: k => k in mem ? mem[k] : null, setItem: (k,v) => mem[k]=String(v)};
Object.defineProperty(globalThis, 'navigator', {value:{platform:'Test'}, configurable:true});
document.execCommand = (c,u,v) => {
  if (c !== 'insertHTML') return false;
  const sel = dom.window.getSelection(); if (!sel.rangeCount) return false;
  const r = sel.getRangeAt(0); r.deleteContents();
  const t = document.createElement('template'); t.innerHTML = v;
  r.insertNode(t.content); return true;
};
let asked = [];
global.fetch = async (url, opt) => {
  const req = JSON.parse(opt.body);
  asked.push(req.action);
  if (req.action === 'title') {
    const named = req.url.includes('/d/GOOD') ? '00.LAB.1a - Lab - I love Physics!' : '';
    return {json: async () => ({ok: true, title: named})};
  }
  return {json: async () => ({ok: true, now: new Date().toISOString(), records: [], saved: [], conflicts: []})};
};
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
loadSync(); cfg.url = 'https://fake/exec'; cfg.token = 'good';

const paste = (cell, text) => {
  openCell(cell);
  const sel = window.getSelection(), r = document.createRange();
  r.selectNodeContents(cell.firstElementChild || cell); r.collapse(true);
  sel.removeAllRanges(); sel.addRange(r);
  const ev = new window.Event('paste', {bubbles:true, cancelable:true});
  ev.clipboardData = {getData: t => t === 'text/plain' ? text : ''};
  cell.dispatchEvent(ev);
  return cell.querySelector('a[data-u]');
};
const cells = [...document.querySelectorAll('.cell.sub[data-f]')];
const blank = c => { openCell(c); c.innerHTML = '<div class="ln"><br></div>'; return c; };

(async () => {
  const url = 'https://docs.google.com/document/d/GOODxxxxxxxxxxxxxxxxxxxxx/edit';
  let a = paste(blank(cells[0]), url);
  console.log('label starts as the url :', a.textContent === url);
  await new Promise(r => setTimeout(r, 20));
  console.log('renamed to the document :', JSON.stringify(a.textContent));
  console.log('url untouched           :', a.dataset.u === url);
  console.log('edit panel shows it too :', document.getElementById('pop').querySelector('.tx').value === a.textContent);

  // a file the account cannot read comes back empty; keep the address
  const bad = 'https://docs.google.com/document/d/NOPExxxxxxxxxxxxxxxxxxxxx/edit';
  a = paste(blank(cells[1]), bad);
  await new Promise(r => setTimeout(r, 20));
  console.log('unreadable file keeps url:', a.textContent === bad);

  // asked once per url, then remembered
  asked = [];
  a = paste(blank(cells[2]), url);
  await new Promise(r => setTimeout(r, 20));
  console.log('second paste is cached   :', asked.filter(x => x === 'title').length === 0);
  console.log('still named correctly    :', a.textContent.includes('I love Physics'));

  // pasting onto selected words never asks — the label is already chosen
  asked = [];
  const c = cells[3];
  openCell(c);
  c.innerHTML = '<div class="ln">the packet</div>';
  const rr = document.createRange();
  rr.selectNodeContents(c.firstElementChild);
  window.getSelection().removeAllRanges(); window.getSelection().addRange(rr);
  const ev = new window.Event('paste', {bubbles:true, cancelable:true});
  ev.clipboardData = {getData: t => t === 'text/plain' ? url : ''};
  c.dispatchEvent(ev);
  await new Promise(r => setTimeout(r, 20));
  console.log('paste onto words: no ask :', asked.filter(x => x === 'title').length === 0);
})();
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
