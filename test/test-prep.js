/* Prep blocks: a header plus a box you can write meetings into. */
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
document.execCommand = () => false;
const pushed = [];
global.fetch = async (url, opt) => {
  const req = JSON.parse(opt.body);
  if (req.action === 'push') { pushed.push(...req.records.map(r => r.key));
    return {json: async () => ({ok:true, now:new Date().toISOString(),
      saved: req.records.map(r => ({key:r.key, updatedAt:'X'})), conflicts:[]})}; }
  return {json: async () => ({ok:true, now:'X', records:[], byTag:{}})};
};
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); winStart = 0; byClass = false; render();
loadSync(); cfg.url='https://fake/exec'; cfg.token='good';

(async () => {
  const box = document.querySelector('.prepbox[data-f=prep]');
  console.log('prep box exists      :', !!box);
  /* Was a text pattern for "Prep · P6". The header is built from elements and
     its order changed, so the pattern silently stopped matching — invisible
     until the suite could fail. Ask the element instead. */
  const phd = document.querySelector('.prephd');
  console.log('has a header         :', !!phd &&
    /^P\\d$/.test((phd.querySelector('.tg') || {}).textContent || '') &&
    /Prep/.test(phd.textContent));

  openCell(box);
  console.log('opens for editing    :', editing === box);
  box.dispatchEvent(new window.InputEvent('beforeinput',
    {bubbles:true, cancelable:true, inputType:'insertText', data:'x'}));
  box.innerHTML = '<div class="ln">Dept meeting, room A214</div>';
  closeCell();
  const rec = recOf(box);
  console.log('saved on the block   :', !!rec.prep && rec.prep[0].spans[0].t === 'Dept meeting, room A214');
  await new Promise(r => setTimeout(r, 20));
  const key = pushed.find(k => /\\|prep$/.test(k));
  console.log('pushed as a record   :', !!key, key);
  console.log('key finds it again   :', !!findRecord(key));

  console.log('');
  stepBack();
  console.log('undo works           :', !recOf(box).prep);

  // it does not collide with the class in the same period on another day
  const other = [...document.querySelectorAll('.cell.sub[data-f=cw]')][0];
  console.log('distinct from a class:',
    recKey(other.dataset.w, other.dataset.d, other.dataset.bi, 'cw') !== key);

  student = true; render();
  console.log('hidden from students :', !document.querySelector('.prepbox'));
  student = false;
  hidePrep = true; render();
  console.log('Hide prep still works:', !document.querySelector('.prepbox'));
  hidePrep = false;
})();
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
