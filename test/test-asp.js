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
loadPrefs(); wireToolbar(); wireEditor(); byClass = true;
for (winStart of [0, 5]) {
  render();
  const view = DAYS.slice(winStart, winStart + SPAN);
  let live = 0, wrong = 0;
  for (const [per] of roster(view)) {
    view.forEach(({d, w, i: di}) => {
      if (!d.cycle) return;
      const meets = d.blocks.some(b => b.period === per && b.block !== 'ASP');
      if (!meets) return;
      const asp = d.blocks.findIndex(b => b.period === per && b.block === 'ASP');
      const cell = document.querySelector('[data-h="' + w + '.' + di + '.' + asp + '"][data-f="cw"]');
      if (asp >= 0) { if (cell) live++; else wrong++; }
    });
  }
  const greyed = document.querySelectorAll('.cell.off').length;
  console.log(windowLabel(view).slice(0,12), '| editable ASP cells', live,
              '| missing', wrong, '| greyed cells on the grid', greyed);
}
// nothing that looks writable is actually dead
render();
const looksWritable = [...document.querySelectorAll('.cell.sub')].filter(el => !el.dataset.f && !el.classList.contains('abs'));
console.log('no tinted cell without a record:', looksWritable.length === 0,
            '(' + looksWritable.length + ')');
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + probe);
