/* jsdom does not resolve CSS variables or cascade, so the applied colour cannot
   be read here. What is checkable is the structure the selector depends on:
   every link inside hidden text must sit within .pv or .pvs. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<div id="app"></div><div id="pop"></div>', {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
const load = f => fs.readFileSync(f,'utf8');
const css = fs.readFileSync('styles.css','utf8');
const probe = `
student = false;
const box = document.getElementById('app');
const line = (linePriv, spanPriv, rel) => ({bullet:false, private:linePriv, spans:[
  {t:'see ', url:null, rel:false, priv:spanPriv},
  {t:'the packet', url:'https://x.test/p', rel:rel, priv:spanPriv}
]});
const check = (name, l) => {
  box.innerHTML = lineHTML(l);
  const a = box.querySelector('a');
  console.log(name.padEnd(24), ':', a.matches('.pv a.l, .pv a.h, .pvs a.l, .pvs a.h') ? 'muted' : 'normal colour');
};
check('released, plain', line(false, false, true));
check('held, plain', line(false, false, false));
check('released in // line', line(true, false, true));
check('held in // line', line(true, false, false));
check('released in (( )) run', line(false, true, true));
check('held in (( )) run', line(false, true, false));
`;
/* the previous rule matched but LOST the cascade: .pv a and a.l are both
   one class plus one element, so source order decided it */
const spec = sel => {
  const cls = (sel.match(/\.[a-zA-Z-]+/g) || []).length;
  const el = (sel.match(/(^|\s)[a-z]+/g) || []).length;
  return cls * 10 + el;
};
const hidden = '.pv a.l', normal = 'a.l';
console.log('hidden-link rule beats a.l:', spec(hidden) > spec(normal),
            '(' + spec(hidden) + ' vs ' + spec(normal) + ')');
console.log('rule present in stylesheet:', /\.pv a\.l, \.pv a\.h, \.pvs a\.l, \.pvs a\.h\{color:var\(--mute\)\}/.test(css));
console.log('dashed box follows the colour:', /a\.h\{[^}]*border:1px dashed currentColor/.test(css));
/* The original regex required colour and underline to be adjacent, in that
   order, on one line. A font-weight declaration was added between them and the
   rule now wraps, so the match broke while the CSS was perfectly correct —
   invisible until the suite could fail. Find the rule by its selector and read
   its body, so neither order nor line breaks nor added properties matter. */
const ruleBody = sel => {
  // comments first: a /* */ block sits directly above most rules here, and it
  // ends up inside the selector text otherwise
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const chunk of bare.split('}')) {
    const i = chunk.lastIndexOf('{');        // last, so an @media wrapper is skipped
    if (i < 0) continue;
    const names = chunk.slice(0, i).split(',').map(s => s.trim().replace(/\s+/g, ' '));
    if (names.includes(sel)) return chunk.slice(i + 1);
  }
  return '';
};
const alBody = ruleBody('a.l');
console.log('underline follows the colour :', !!alBody &&
            /color:var\(--link\)/.test(alBody) && /text-decoration:underline/.test(alBody));
console.log('');
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
