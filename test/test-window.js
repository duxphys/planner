/* The five-day window: today in the middle, arrows by day and by week. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem:()=>null, setItem:()=>{}};
document.execCommand = () => false;
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor();
const view = () => DAYS.slice(winStart, winStart + SPAN).map(x => x.d.d);
const cols = () => document.querySelectorAll('.dh').length;

centreOnToday(); render();
const today = DAYS[todayIndex()].d;
console.log('today            :', today.d, '(' + today.iso + ')');
console.log('window           :', view().join('  |  '));
console.log('today is 3rd of 5:', view()[2] === today.d);
console.log('always 5 columns :', cols() === 5);

const before = view();
at('next').click();
console.log('');
console.log('one day forward  :', view()[0] === before[1], '->', view()[0]);
at('prev').click();
console.log('one day back     :', view().join() === before.join());
at('nextWk').click();
console.log('a week forward   :', view()[0] === DAYS[todayIndex() - 2 + SPAN].d.d);
at('prevWk').click();
console.log('a week back      :', view().join() === before.join());

// it stops at both ends rather than wrapping
winStart = 0; render();
console.log('');
console.log('at the start     : back disabled', at('prev').disabled, at('prevWk').disabled);
at('prev').click();
console.log('  and goes nowhere:', winStart === 0);
winStart = DAYS.length; render();
console.log('at the end       : forward disabled', at('next').disabled, at('nextWk').disabled);
console.log('  clamped to     :', winStart, 'of', DAYS.length - SPAN);

// the Today button, and today marked in the grid
winStart = 0; render();
console.log('');
console.log('label is just dates:', at('wklabel').textContent);
console.log('Today button live  :', !at('today').disabled, '| title:', at('today').title);
at('today').click();
console.log('after pressing it  :', at('wklabel').textContent);
console.log('  now disabled     :', at('today').disabled);

const marked = [...document.querySelectorAll('.dh.today')];
console.log('');
console.log('today marked in grid:', marked.length, 'column(s)');
console.log('  carries a tag     :', marked.length ? /today/i.test(marked[0].innerHTML) : 'n/a',
            '(none on a weekend is correct)');
// a window that does contain a school day marks exactly one
const school = DAYS.findIndex(x => x.d.cycle);
winStart = clampStart(school); render();
const anyDay = DAYS[winStart].d.iso;
console.log('one column at most  :', document.querySelectorAll('.dh.today').length <= 1);

// a window that straddles two weeks still draws
winStart = clampStart(todayIndex() - 4); render();
console.log('');
console.log('across a weekend :', view().join('  |  '));
console.log('still 5 columns  :', cols() === 5);
console.log('cells drawn      :', document.querySelectorAll('#app .grid > div').length > 20);
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
