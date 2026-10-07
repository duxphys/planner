/* A day cancelled after the fact: the cells keep their work, every block says
   why, and students see none of it. */
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
loadPrefs(); wireToolbar(); wireEditor(); winStart = 0; byClass = false; render();
const grid = () => document.getElementById('app').innerHTML;

// a day the calendar never had school: one band, not one label and four blanks
const offCols = [...document.querySelectorAll('.cell.off.offday')];
console.log('no-school days merged   :', offCols.length, 'column(s)');
const spanOf = el => +(/span (\\d+)/.exec(el.style.gridRow) || [0, 0])[1];
const blockRows = [...document.querySelectorAll('.rb')].length;   // one per block
console.log('  spans the whole body  :', offCols.map(spanOf).join(', '),
            'rows, over', blockRows, 'blocks');
console.log('  same span every time  :', new Set(offCols.map(spanOf)).size === 1 &&
            spanOf(offCols[0]) > blockRows);
console.log('  and is labelled once  :', offCols.every(el => el.textContent.trim().length > 0));
console.log('  no blank off cells    :', ![...document.querySelectorAll('.cell.off')]
  .some(el => !el.classList.contains('offday') && !el.textContent.trim() && el.style.gridRow.includes('span 1')));

// now cancel a school day that already has work in it
const day = WEEKS[0].days.find(d => d.cycle && d.blocks.some(b => b.course && b.cw));
const before = JSON.stringify(day.blocks.map(b => b.cw));
day.offLines = [{bullet:false, private:false, spans:[{t:'Snow day', url:null, rel:false, priv:false}]}];
render();
console.log('');
console.log('day reads as cancelled  :', isCancelled(day));
console.log('work is untouched       :', JSON.stringify(day.blocks.map(b => b.cw)) === before);
console.log('cells still on screen   :', /Hand Out Course Expectations|00.LAB/.test(grid()) ||
  document.querySelectorAll('[data-h="0.' + WEEKS[0].days.indexOf(day) + '.0"]').length > 0);
console.log('every block says why    :', document.querySelectorAll('.cxl').length, 'block(s) marked');
console.log('cells stay editable     :', [...document.querySelectorAll('.cell.sub[data-f]')]
  .some(el => el.dataset.d == WEEKS[0].days.indexOf(day)));
console.log('column is NOT merged    :', !document.querySelector('.offday[style*="grid-column:' +
  (WEEKS[0].days.indexOf(day) + 2) + '"]'));

student = true; render();
console.log('');
console.log('students see the reason :', /Snow day/.test(grid()));
console.log('and not the cycle day   :', !/Day 3/.test(
  document.querySelector('.dh:nth-of-type(' + (WEEKS[0].days.indexOf(day) + 2) + ')') ?
  document.querySelectorAll('.dh')[WEEKS[0].days.indexOf(day)].textContent : ''));
student = false; render();

// the whole column updates when the field is closed, not just the field
day.offLines = null; render();
console.log('');
console.log('cleared: no marks       :', document.querySelectorAll('.cxl').length === 0);
const fld = document.querySelector('[data-f=off][data-h="0.' + WEEKS[0].days.indexOf(day) + '.o"]');
day.offLines = [{bullet:false, private:false, spans:[{t:'Snow Day', url:null, rel:false, priv:false}]}];
markCancelled(0, WEEKS[0].days.indexOf(day), fld);
console.log('marking updates column  :', document.querySelectorAll('.cxl').length, 'blocks');
console.log('  without a full redraw :', document.querySelectorAll('.cxl')[0].textContent === 'Snow Day');
day.offLines = null;
markCancelled(0, WEEKS[0].days.indexOf(day), fld);
console.log('clearing removes them   :', document.querySelectorAll('.cxl').length === 0);
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
