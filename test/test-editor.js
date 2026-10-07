const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<body><div id="app"></div><div id="pop"><div class="u"></div>' +
  '<div class="row"><button data-act="rel"></button></div></div></body>');
global.window = dom.window; global.document = dom.window.document;
const load = f => fs.readFileSync(f, 'utf8');

const probe = `
let cells = 0, ok = 0; const bad = [];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
for (const w of WEEKS)
  for (const d of w.days)
    for (const b of d.blocks)
      for (const f of ['cw', 'hw']) {
        const orig = b[f];
        if (!orig || !orig.length) continue;
        cells++;
        const el = document.createElement('div');
        el.innerHTML = editHTML(orig);
        const back = cellLines(el);
        if (same(orig, back)) ok++;
        else bad.push({where: w.label + ' ' + d.d + ' ' + b.block + ' ' + f, orig, back});
      }
console.log('every cell round-trips  :', cells > 0 && ok === cells,
            ok + '/' + cells + ' identical');
bad.slice(0, 3).forEach(b => {
  console.log('\\nMISMATCH ' + b.where);
  console.log('  was : ' + JSON.stringify(b.orig).slice(0, 260));
  console.log('  got : ' + JSON.stringify(b.back).slice(0, 260));
});
const flat = WEEKS.flatMap(w => w.days.flatMap(d => d.blocks.flatMap(b => [b.cw, b.hw]))).filter(Boolean);
const spans = flat.flat().filter(Boolean).flatMap(l => l.spans);
console.log('\\nlinks ' + spans.filter(s => s.url).length +
            ' | released ' + spans.filter(s => s.url && s.rel).length +
            ' | private lines ' + flat.flat().filter(l => l && l.private).length +
            ' | bullets ' + flat.flat().filter(l => l && l.bullet).length);
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + probe);
