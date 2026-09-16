/* Apps Script answers a POST with a 302, and a browser following it converts
   POST to GET and drops the body. The request then lands in doGet. Every action
   is safe to repeat, so it is sent again rather than shown as a failure. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<header><nav></nav></header><main id="app"></main><div id="pop"></div>',
  {pretendToBeVisual: true});
global.window = dom.window; global.document = dom.window.document;
global.localStorage = {getItem: () => null, setItem: () => {}};
const load = f => fs.readFileSync(f, 'utf8');
const probe = `
loadPrefs();
cfg = {url: 'https://x/exec', token: 't', device: 'test'};

// the first attempt is converted; the second lands properly
let tries = 0;
global.fetch = async () => {
  tries++;
  return {json: async () => tries === 1
    ? {ok: false, error: 'which class? add ?class=p1 (p1 p2 p4 p5 p7)'}
    : {ok: true, byTag: {P1: {'9/14': {AB: ['A Student']}}}}};
};
let out = await call('absences', {});
console.log('--- a converted POST ---');
console.log('attempts made     :', tries, '(sent again, not reported)');
console.log('got the real answer:', !!out.byTag);

// the newer wording is recognised too
tries = 0;
global.fetch = async () => {
  tries++;
  return {json: async () => tries === 1
    ? {ok: false, error: 'this endpoint expects a POST — the request arrived with no body'}
    : {ok: true, byTag: {}}};
};
await call('absences', {});
console.log('the plainer message too:', tries === 2);

// it gives up rather than looping
tries = 0;
global.fetch = async () => { tries++; return {json: async () => ({ok: false, error: 'which class?'})}; };
let threw = '';
try { await call('absences', {}); } catch (e) { threw = e.message; }
console.log('');
console.log('--- when it keeps happening ---');
console.log('attempts made :', tries, '(one retry, then it stops)');
console.log('and it reports:', JSON.stringify(threw));

// a real error is never retried away
tries = 0;
global.fetch = async () => { tries++; return {json: async () => ({ok: false, error: 'bad token'})}; };
threw = '';
try { await call('absences', {}); } catch (e) { threw = e.message; }
console.log('');
console.log('--- a genuine failure ---');
console.log('attempts made :', tries, '(no retry)');
console.log('and it reports:', JSON.stringify(threw));
`;
eval('(async () => {' + load('data.js') + load('render.js') + load('sync.js') + probe + '})()');
