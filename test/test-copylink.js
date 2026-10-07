const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem:()=>null, setItem:()=>{}};
const load = f => fs.readFileSync(f,'utf8');

let execCopied = null;
document.execCommand = (cmd) => {
  if (cmd === 'copy') { execCopied = document.activeElement && document.activeElement.value; return true; }
  return false;
};
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
const cell = [...document.querySelectorAll('.cell.sub[data-f]')].find(c => c.querySelector('a[data-u]'));
openCell(cell);
const a = cell.querySelector('a[data-u]');
const url = a.dataset.u;

// case 1: the clipboard API rejects, as it does on a file:// page in some browsers
setNav({clipboard: {writeText: () => Promise.reject(new Error('denied'))}});
showPop(a);
document.querySelector('#pop [data-act=copy]').click();
setTimeout(() => {
  console.log('api rejected -> fell back to execCommand:', copiedViaExec() === url);
  console.log('confirmation shown  :', document.getElementById('pop').textContent.trim());

  // case 2: no clipboard API at all
  setNav({});
  showPop(a);
  document.querySelector('#pop [data-act=copy]').click();
  console.log('no api       -> fell back            :', copiedViaExec() === url);

  // case 3: the API works
  let viaApi = null;
  setNav({clipboard: {writeText: t => { viaApi = t; return Promise.resolve(); }}});
  showPop(a);
  document.querySelector('#pop [data-act=copy]').click();
  setTimeout(() => {
    console.log('api works    -> used directly       :', viaApi === url);
    console.log('confirmation shown  :', document.getElementById('pop').textContent.trim());
  }, 5);
}, 5);
`;
global.copiedViaExec = () => execCopied;
// node defines navigator as a read-only global, so it has to be redefined
global.setNav = v => Object.defineProperty(globalThis, 'navigator',
  {value: v, configurable: true, writable: true});
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + probe);
