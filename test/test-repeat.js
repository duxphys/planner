/* Repeating a cell down the rotation: click the "Day 4" tag and the selected
   cell lands on every other Day 4. The point of the test is what it must NOT
   do — overwrite anything already written, touch another cycle day, or let a
   prep note reach a student. */
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
loadPrefs(); wireToolbar(); wireEditor(); winStart = 0; byClass = false; hidePrep = false; render();

let answer = true, asked = '';
window.confirm = m => { asked = m; return answer; };

const text = t => [{bullet:false, private:false, spans:[{t, url:null, rel:false, priv:false}]}];
const flat = ls => (ls || []).map(l => l.spans.map(s => s.t).join('')).join(' ');
const dayList = c => DAYS.filter(x => x.d.cycle === c).map(x => x.d);
const aspIdx = d => d.blocks.findIndex(b => b.asp);
/* the grid only draws the days in the window, so scroll to a day before
   selecting a cell in it */
const show = d => { winStart = clampStart(DAYS.findIndex(x => x.d === d)); render(); };
const cellFor = (d, bi, f) => {
  show(d);
  const x = DAYS.find(y => y.d === d);
  return document.querySelector('[data-w="' + x.w + '"][data-d="' + x.i +
    '"][data-bi="' + bi + '"][data-f="' + f + '"]');
};

const d4 = dayList(4), d2 = dayList(2);
const bi = aspIdx(d4[0]);
console.log('Day 4s in the year      :', d4.length);
console.log('ASP block index         :', bi, '- free on every Day 4 :',
            d4.every(d => !d.blocks[bi].course));
console.log('ASP period is constant  :', new Set(d4.map(d => d.blocks[bi].period)).size === 1,
            '-> P' + d4[0].blocks[bi].period);

/* one Day 4 already has a different note in that cell: it must survive */
d4[3].blocks[bi].prep = text('Dept chair meeting');
/* and one is a snow day: nothing should be written into a cancelled day */
d4[5].offLines = text('Snow day');

d4[0].blocks[bi].prep = text('PLC with Gentry');
render();
const cell = cellFor(d4[0], bi, 'prep');
console.log('source cell is on screen:', !!cell);
select(cell);
repeatOnCycle(4);

const got = d4.filter(d => flat(d.blocks[bi].prep) === 'PLC with Gentry');
console.log('');
console.log('filled, incl. the source:', got.length, 'of', d4.length);
console.log('  left the busy one be  :', flat(d4[3].blocks[bi].prep) === 'Dept chair meeting');
console.log('  skipped the snow day  :', !d4[5].blocks[bi].prep);
console.log('  that accounts for all :', got.length + 2 === d4.length);
console.log('  no shared line object :', d4[1].blocks[bi].prep !== d4[0].blocks[bi].prep &&
            d4[1].blocks[bi].prep[0].spans !== d4[0].blocks[bi].prep[0].spans);

const keys = Object.keys(queue);
console.log('');
console.log('queued for the endpoint :', keys.length, 'record(s)');
const aspKey = new RegExp('\\\\|P' + d4[0].blocks[bi].period + 'a\\\\|prep$');
console.log('  every key is that ASP :', keys.every(k => aspKey.test(k)));
console.log('  one per filled day    :', keys.length === got.length - 1);
console.log('  none of them a source :', !keys.some(k => k.startsWith(d4[0].iso)));

/* another cycle day must be untouched, and so must every other block */
console.log('');
console.log('Day 2 untouched         :', !d2.some(d => d.blocks[aspIdx(d)].prep));
console.log('other blocks untouched  :', !d4.some(d => d.blocks.some((b, i) => i !== bi && b.prep)));

/* a second click, with one day holding something else: the offer is to take
   back out only what matches, and it has to say so rather than claim all */
for (const k of Object.keys(queue)) delete queue[k];
answer = false;
select(cellFor(d4[0], bi, 'prep'));
repeatOnCycle(4);
console.log('');
console.log('second click offers undo:', /^Take this back out of 9 /.test(asked));
console.log('  and names the odd one :', /1 have something else/.test(asked));
console.log('  saying no writes none :', Object.keys(queue).length === 0);
console.log('  and changes nothing   :', flat(d4[1].blocks[bi].prep) === 'PLC with Gentry' &&
            flat(d4[3].blocks[bi].prep) === 'Dept chair meeting');

/* with every day identical, saying yes takes it back out */
answer = true;
d4[3].blocks[bi].prep = text('PLC with Gentry');
repeatOnCycle(4);
console.log('');
console.log('clears every other day  :', d4.filter(d => d !== d4[0] && d.blocks[bi].prep).length === 0);
console.log('  source is left alone  :', flat(d4[0].blocks[bi].prep) === 'PLC with Gentry');
console.log('  and queued as cleared :', Object.keys(queue).length === 10 &&
            Object.values(queue).every(v => v === null));

/* the wrong column: the tag only ever acts on a cell of its own cycle day */
d2[0].blocks[aspIdx(d2[0])].prep = text('Co-planning with Murphy');
select(cellFor(d2[0], aspIdx(d2[0]), 'prep'));
for (const k of Object.keys(queue)) delete queue[k];
repeatOnCycle(4);
console.log('');
console.log('Day 2 cell + Day 4 tag  : refused :', Object.keys(queue).length === 0);
repeatOnCycle(2);
console.log('Day 2 cell + Day 2 tag  : filled  :',
            d2.filter(d => flat(d.blocks[aspIdx(d)].prep) === 'Co-planning with Murphy').length,
            'of', d2.length);

/* a day-note field has no block, so there is nothing to repeat */
for (const k of Object.keys(queue)) delete queue[k];
select(document.querySelector('.dhnote[data-f]'));
repeatOnCycle(4);
console.log('');
console.log('day note refuses        :', Object.keys(queue).length === 0);
select(null);
repeatOnCycle(4);
console.log('no selection refuses    :', Object.keys(queue).length === 0);

/* the wiring: a real mousedown on the tag, not a direct call */
for (const k of Object.keys(queue)) delete queue[k];
d4.forEach(d => { d.blocks[bi].prep = null; });
d4[0].blocks[bi].prep = text('PLC with Gentry');
select(cellFor(d4[0], bi, 'prep'));
const tag = [...document.querySelectorAll('.cyc')].find(t => t.dataset.cyc === '4');
console.log('');
console.log('tag is in the header    :', !!tag, tag ? '"' + tag.textContent + '"' : '');
tag.dispatchEvent(new window.MouseEvent('mousedown', {bubbles:true, cancelable:true}));
console.log('mousedown does the work :',
            d4.filter(d => flat(d.blocks[bi].prep) === 'PLC with Gentry').length, 'of', d4.length);

/* and none of it is student-facing */
student = true; render();
const seen = document.getElementById('app').innerHTML;
console.log('');
console.log('students see no prep    :', !/PLC with Gentry|Co-planning with Murphy/.test(seen));
console.log('and no clickable tag    :', document.querySelectorAll('.cyc').length === 0);
student = false;
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
