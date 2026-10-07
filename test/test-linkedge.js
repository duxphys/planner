/* Typing with the caret parked at a link's trailing edge — the case where the
   browser puts it INSIDE the anchor and absorbs whatever comes next. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem:()=>null, setItem:()=>{}};
document.execCommand = () => false;
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
const cell = [...document.querySelectorAll('.cell.sub[data-f]')].find(c => !recOf(c)[c.dataset.f]);

const setup = trailing => {
  openCell(cell);
  cell.innerHTML = '<div class="ln">See <a class="h" data-u="https://x.test/p" data-r="0">the packet</a>' +
    '\\u200B' + (trailing || '') + '</div>';
  const a = cell.querySelector('a');
  const t = a.firstChild;                        // caret INSIDE the link, at its end
  const r = document.createRange();
  r.setStart(t, t.nodeValue.length); r.collapse(true);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  return a;
};
const type = txt => {
  const ev = new window.InputEvent('beforeinput', {bubbles:true, cancelable:true, inputType:'insertText', data:txt});
  (editing || document.body).dispatchEvent(ev);
  const r = window.getSelection().getRangeAt(0);
  const n = r.startContainer;
  if (n.nodeType === 3) n.nodeValue = n.nodeValue.slice(0, r.startOffset) + txt + n.nodeValue.slice(r.startOffset);
  return n;
};

// link at the end of a line
let a = setup('');
let landed = type(' then more');
console.log('end of line  -> stayed out of the link:', !a.contains(landed));
console.log('             -> link text unchanged   :', a.textContent === 'the packet');

// link mid-line, with text after it
a = setup(' and later');
landed = type('XYZ');
console.log('mid line     -> stayed out of the link:', !a.contains(landed));
console.log('             -> link text unchanged   :', a.textContent === 'the packet');

// and the record has no zero-width leftovers
const back = cellLines(cell).filter(Boolean).flatMap(l => l.spans);
console.log('record is clean                       :', !back.some(s => s.t.includes('\\u200B')));
console.log('typed text is in the record           :', back.some(s => !s.url && s.t.includes('XYZ')));
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
