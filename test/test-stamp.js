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

/* A retired file left in the Apps Script project is the quietest failure of
   all: every .gs file shares one namespace and the last parsed wins, so an old
   Publish.gs can replace a function in Sync.gs with nothing said. */
console.log('');
console.log('--- retired code left in the project is detected ---');
const health = gs.slice(gs.indexOf("lines.push('OTHER CODE IN THIS PROJECT')"),
                        gs.indexOf("lines.push('TABS')"));
const watched = ['readAbsences', 'readGradebookConfig', 'readStudentLinks',
                 'inspectTab', 'resolveTabs', 'buildCycle', 'extendRotation',
                 'pushFeeds', 'ghCommitAll'];
console.log('names it watches for :', watched.every(n => health.includes("'" + n + "'")));
console.log('says what to do      :', /Delete those files/.test(health));
// and none of them may be defined by Sync.gs itself, or it would cry wolf
const own = [...gs.matchAll(/^function ([A-Za-z_]\w*)/gm)].map(m => m[1]);
const clash = watched.filter(n => own.includes(n));
console.log('no false alarm       :', clash.length === 0,
            clash.length ? '(Sync.gs itself defines ' + clash.join(', ') + ')' : '');
