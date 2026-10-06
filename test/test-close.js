const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem:()=>null, setItem:()=>{}};
global.navigator = dom.window.navigator;
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
const cells = [...document.querySelectorAll('.cell.sub[data-f]')];
const c = cells.find(x => (recOf(x)[x.dataset.f]||[]).some(l => l && l.bullet));

const before = c.innerHTML;
openCell(c);
const opened = c.innerHTML;
console.log('open  -> ce attr:', c.getAttribute('contenteditable'),
            '| markers visible:', /(^|>)- /.test(opened));
closeCell();
console.log('close -> ce attr:', c.getAttribute('contenteditable'),
            '| markers hidden:', !/(^|>)- /.test(c.innerHTML),
            '| matches original:', c.innerHTML === before);

// the CSS bug: does the selector still match once closed?
/* Both were printed as raw facts, where false was the PASS. A verdict has to
   read true = good, or nobody can tell a pass from a regression. */
console.log('closed cell is not editable    :', !c.matches('[contenteditable]'));
console.log('  nor by the ="true" selector  :', !c.matches('[contenteditable="true"]'));

// edit panel has both fields
openCell(c);
const withLink = cells.find(x => (recOf(x)[x.dataset.f]||[]).some(l => l && l.spans.some(s=>s.url)));
openCell(withLink);
const a = withLink.querySelector('a');
showPop(a);
document.querySelector('#pop [data-act=edit]').click();
const p = document.getElementById('pop');
console.log('edit panel: text =', JSON.stringify(p.querySelector('.tx').value.slice(0,28)),
            '| link =', JSON.stringify(p.querySelector('.ur').value.slice(0,34)));
console.log('panel open class:', p.classList.contains('editing'));
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + probe);
