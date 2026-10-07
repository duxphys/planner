const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<body><div id="app"></div><div id="pop"><div class="u"></div>' +
  '<div class="row"><button data-act="rel"></button></div></div></body>');
global.window = dom.window; global.document = dom.window.document;
const load = f => fs.readFileSync(f, 'utf8');
const probe = `
const cell = document.createElement('div');
const txt = l => l.spans.map(s => (s.priv ? '[' : '') + s.t + (s.priv ? ']' : '')).join('');

cell.innerHTML = '<div class="ln">Lab writeup ((check Sam)) due Friday</div>' +
  '<div class="ln">((mineralization activity (key)))</div>' +
  '<div class="ln">Read <a class="l" href="https://x.test/p" data-u="https://x.test/p" data-r="1">the packet</a> ((only period 2))</div>' +
  '<div class="ln">// whole line hidden</div>';
const out = cellLines(cell);
out.forEach((l, i) => console.log(i, '| line-private', String(l.private).padEnd(5), '|', txt(l)));

console.log('\\nnested brackets kept:', JSON.stringify(out[1].spans[0].t));
console.log('link intact next to private run:',
  JSON.stringify(out[2].spans.find(s => s.url)));

console.log('\\nteacher sees:');
out.forEach(l => console.log('   ' + lineHTML(l).replace(/<[^>]+>/g, '')));
student = true;
console.log('student sees:');
out.forEach(l => { const h = lines([l]); if (h.trim()) console.log('   ' + h.replace(/<[^>]+>/g, '')); });
student = false;

// and it survives a second round trip
cell.innerHTML = editHTML(out);
console.log('\\nre-edit round trip identical:', JSON.stringify(cellLines(cell)) === JSON.stringify(out));
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + probe);
