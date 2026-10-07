/* A released link must open in the student preview; a held one must not exist
   as a link at all. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem:()=>null, setItem:()=>{}};
document.execCommand = () => false;
let opened = [];
dom.window.open = (u) => { opened.push(u); return null; };
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor();

// teacher view: a click opens the cell, it does not navigate
student = false; render();
let a = document.querySelector('#app a.l');
a.dispatchEvent(new window.MouseEvent('mousedown', {bubbles:true, cancelable:true}));
a.dispatchEvent(new window.MouseEvent('click', {bubbles:true, cancelable:true}));
console.log('teacher: cell opened     :', !!editing);
console.log('teacher: did not navigate:', opened.length === 0);

// student view: a released link opens
closeCell(); student = true; render();
opened = [];
a = document.querySelector('#app a.l');
console.log('student: released link is clickable:', !!a);
a.dispatchEvent(new window.MouseEvent('click', {bubbles:true, cancelable:true}));
console.log('student: it opened       :', opened.length === 1 && opened[0] === a.dataset.u);

// held links are not links for students
console.log('student: no held anchors :', !document.querySelector('#app a.h'));
console.log('student: held shown as text:', !!document.querySelector('#app .pend'));
student = false;
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
