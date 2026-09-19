/* A machine pointed at an old deployment answers normally — just with old
   behaviour and wording that changed versions ago. Every reply now carries the
   version that produced it, and the app repeats it in anything it shows me. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<header><nav></nav><button id="sync"></button></header>' +
  '<main id="app"></main><div id="pop"></div>', {pretendToBeVisual: true});
global.window = dom.window; global.document = dom.window.document;
const mem = {};
global.localStorage = {getItem: k => k in mem ? mem[k] : null, setItem: (k, v) => mem[k] = String(v)};
const load = f => fs.readFileSync(f, 'utf8');

console.log('--- the endpoint stamps every reply ---');
const gs = fs.readFileSync('apps-script/Sync.gs', 'utf8');
const outFn = gs.slice(gs.indexOf('function out(o)'), gs.indexOf('function out(o)') + 320);
console.log('out() adds the version   :', /o\.version === undefined\) o\.version = VERSION/.test(outFn));
console.log('without clobbering one   :', /=== undefined/.test(outFn));

const probe = `
loadPrefs();
cfg = {url: 'https://script.google.com/macros/s/OLD_ONE/exec', token: 't', device: 'd'};

// an old deployment: answers, but with wording from before the readers moved
global.fetch = async () => ({json: async () => ({
  ok: false, version: 'v11 2026-09-04',
  error: 'keep Publish.gs in this project \\u2014 its readers are used here'})});
try { await pullAbsences(); } catch (err) {
  absentNote = 'Absences unavailable' + (srvVersion ? ' (endpoint ' + srvVersion + ')' : '') +
               ': ' + err.message;
}
console.log('');
console.log('--- what the app now says ---');
console.log(' ', absentNote);
console.log('it names the deployment  :', /endpoint v11/.test(absentNote));

setNote('Up to date');
console.log('');
console.log('--- and hovering Sync says which one ---');
console.log('tooltip carries version  :', /endpoint v11/.test(document.getElementById('sync').title));
console.log('tooltip carries the url  :', /OLD_ONE/.test(document.getElementById('sync').title));
`;
eval('(async () => {' + load('data.js') + load('render.js') + load('sync.js') + probe + '})()');
