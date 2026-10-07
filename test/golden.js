/* A refactor net, not a test.
 *
 * Renders every combination of view, colour, span, student and prep at three
 * window positions — 216 states — and writes the exact DOM to /tmp/golden.txt.
 * Run it BEFORE a refactor, copy the file aside, run it AFTER, and diff.
 * Identical output means the change was structural only.
 *
 *   node test/golden.js && cp /tmp/golden.txt /tmp/before.txt
 *   ...refactor...
 *   node test/golden.js && diff -q /tmp/before.txt /tmp/golden.txt
 *
 * Deliberately NOT named test-*.js: it is not run by run-all.js, because a
 * snapshot of the markup would fail on every intentional change to the UI. */
const fs = require('fs'), crypto = require('crypto');
const {JSDOM} = require('jsdom');
process.chdir('/home/claude/app');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem:()=>null, setItem:()=>{}};
document.execCommand = () => false;
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor();
absent = {'P1|9/2': ['AB: X Y', 'T: Z W']};
const day = DAYS.find(x => x.d.cycle);
day.d.offLines = [{bullet:false, private:false, spans:[{t:'Snow Day', url:null, rel:false, priv:false}]}];
const out = [];
for (const v of [false, true])
  for (const sp of [2, 5, 6])
    for (const c of [0, 1, 2])
      for (const st of [false, true])
        for (const hp of [false, true]) {
          byClass = v; SPAN = sp; ci = c; student = st; hidePrep = hp;
          for (const ws of [0, 7, DAYS.length - 1]) {
            winStart = ws; render();
            out.push(document.getElementById('app').innerHTML +
                     '|' + document.getElementById('classbar').innerHTML);
          }
        }
require('fs').writeFileSync('/tmp/golden.txt', out.join('\\n@@@\\n'));
console.log('states captured:', out.length);
console.log('hash:', require('crypto').createHash('sha256').update(out.join('')).digest('hex').slice(0,16));
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
