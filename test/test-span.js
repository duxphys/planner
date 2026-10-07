/* How many weekdays are on screen is a per-machine preference. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
const mem = {};
global.localStorage = {getItem: k => k in mem ? mem[k] : null, setItem: (k,v) => mem[k]=String(v)};
document.execCommand = () => false;
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor();
const cols = () => document.querySelectorAll('.dh').length;
const mid = () => DAYS.slice(winStart, winStart + SPAN).findIndex(x => x.d.iso === DAYS[todayIndex()].d.iso);

for (const n of [2, 3, 4, 5, 6]) {
  SPAN = n; centreOnToday(); render();
  console.log(String(n) + ' days ->', cols(), 'columns |',
    'today at position', mid() + 1, 'of', n, '|',
    document.documentElement.style.getPropertyValue('--cols'), 'in css');
}

// the button cycles, and the label box is re-measured for the new width
SPAN = 5; sized = false; render();
const w5 = at('wksizer').textContent;
at('span').click();
console.log('');
console.log('button cycles 5 ->', SPAN);
console.log('label box remeasured:', at('wksizer').textContent !== w5,
            '|', JSON.stringify(at('wksizer').textContent));

// it survives a reload
SPAN = 3; render(); savePrefs();
console.log('');
console.log('saved as            :', JSON.parse(localStorage.getItem('planner.view.v1')).SPAN);
SPAN = 5; loadPrefs();
console.log('restored on reload  :', SPAN);

// clamped at the calendar's end whatever the width
SPAN = 6; winStart = DAYS.length; render();
console.log('');
console.log('clamped at the end  :', winStart, '=', DAYS.length - SPAN, '| columns', cols());
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
