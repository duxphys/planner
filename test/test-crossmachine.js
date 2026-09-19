/* Working across three machines is the part that has to be right: a plan typed
   on one and lost on another is the worst failure this app has. These are the
   ways it went wrong, each one kept as a test so it cannot come back. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<header><nav></nav></header><main id="app"></main><div id="pop"></div>',
  {pretendToBeVisual: true});
global.window = dom.window; global.document = dom.window.document;
const mem = {};
global.localStorage = {getItem: k => k in mem ? mem[k] : null, setItem: (k, v) => mem[k] = String(v)};
let asked = 0;
global.window.confirm = () => { asked++; return true; };
const load = f => fs.readFileSync(f, 'utf8');

const probe = `
loadPrefs();
const KEY = '2026-09-09|P1|cw';
const line = t => ({bullet: false, private: false,
                    spans: [{t: t, url: null, rel: false, priv: false}]});
const textOf = ls => (ls || []).filter(Boolean).map(l => l.spans.map(s => s.t).join('')).join(' | ');
const reset = () => { cfg = {url: 'https://x/exec', token: 't', device: 'MacIntel-aaaa'};
                      queue = {}; base = {}; asked = 0; };

console.log('--- an unsent edit keeps the version it was made against ---');
reset();
queue[KEY] = [line('my Wednesday plan')]; base[KEY] = 'T1';
global.fetch = async (u, o) => {
  const r = JSON.parse(o.body);
  if (r.action === 'pull') return {json: async () => ({ok: true, now: 'T2', records: [
    {key: KEY, updatedAt: 'T2', lines: [line('the other machine plan')]}]})};
  return {json: async () => ({ok: true, now: 'T2', records: [], saved: [], conflicts: []})};
};
await pullNow();
console.log('my edit is still held    :', !!queue[KEY]);
console.log('base stays where it was  :', base[KEY], '(must be T1, not T2)');
console.log('so the guard can fire    :', base[KEY] === 'T1');

let sent = null;
global.fetch = async (u, o) => {
  const r = JSON.parse(o.body);
  if (r.action === 'push') sent = r.records[0];
  return {json: async () => ({ok: true, now: 'T3', saved: [{key: KEY, updatedAt: 'T3'}], conflicts: []})};
};
await flush();
console.log('the push carries it      :', sent.base, '\\u2014 the server is at T2, so it is refused');

console.log('');
console.log('--- when the server refuses, BOTH versions survive ---');
reset();
queue[KEY] = [line('my Wednesday plan')]; base[KEY] = 'T1';
global.fetch = async (u, o) => {
  const r = JSON.parse(o.body);
  if (r.action !== 'push') return {json: async () => ({ok: true, now: 'T2', records: [], saved: [], conflicts: []})};
  return {json: async () => ({ok: true, now: 'T2', saved: [], conflicts: [
    {key: KEY, updatedAt: 'T2', device: 'Win32-bbbb', lines: [line('the other machine plan')]}]})};
};
await flush();
const kept = queue[KEY];
console.log('nothing was discarded    :', !!kept);
console.log('theirs is there          :', /the other machine plan/.test(textOf(kept)));
console.log('mine is there            :', /my Wednesday plan/.test(textOf(kept)));
console.log('and it is labelled       :', /Kept from this machine/.test(textOf(kept)));
console.log('no dialog interrupted me :', asked === 0);

console.log('');
console.log('--- the rescued copy can never reach a student ---');
const rescued = kept.filter(Boolean).filter(l => /my Wednesday plan|Kept from this machine/.test(
  l.spans.map(s => s.t).join('')));
console.log('every rescued line is private:', rescued.length > 0 && rescued.every(l => l.private === true));
console.log('theirs stays public          :', kept.filter(Boolean)
  .some(l => !l.private && /the other machine plan/.test(l.spans.map(s => s.t).join(''))));

console.log('');
console.log('--- a clash that keeps coming back does not stack copies ---');
let round = kept;
for (let i = 0; i < 4; i++) {
  round = keepBoth([line('the other machine plan')], round, {device: 'Win32-bbbb', updatedAt: 'T2'});
}
const times = s => (textOf(round).match(new RegExp(s, 'g')) || []).length;
console.log('one label after 4 rounds :', times('Kept from this machine') === 1);
console.log('theirs appears once      :', times('the other machine plan') === 1);
console.log('mine is still in there   :', /my Wednesday plan/.test(textOf(round)));

console.log('');
console.log('--- a cell this build cannot show is still not thrown away ---');
reset();
const GHOST = '2027-06-01|P1|cw';
queue[GHOST] = [line('semester two plan')]; base[GHOST] = 'T1';
global.fetch = async (u, o) => {
  const r = JSON.parse(o.body);
  if (r.action !== 'push') return {json: async () => ({ok: true, now: 'T2', records: [], saved: [], conflicts: []})};
  return {json: async () => ({ok: true, now: 'T2', saved: [], conflicts: [
    {key: GHOST, updatedAt: 'T2', device: 'Win32-bbbb', lines: [line('theirs')]}]})};
};
await flush();
console.log('no matching cell on screen:', findRecord(GHOST) === null);
console.log('still held, not dropped   :', !!queue[GHOST] && /semester two plan/.test(textOf(queue[GHOST])));

console.log('');
console.log('--- a pull never overwrites an edit I have not sent ---');
reset();
render();
const cell = [...document.querySelectorAll('.cell.sub[data-f]')].find(c => c.dataset.f === 'cw');
const liveKey = findRecord('2026-09-02|P1|cw') ? '2026-09-02|P1|cw' : null;
if (liveKey) {
  queue[liveKey] = [line('mine, unsent')]; base[liveKey] = 'T1';
  const spot = findRecord(liveKey);
  const holder = spot.bi === null ? WEEKS[spot.w].days[spot.d] : WEEKS[spot.w].days[spot.d].blocks[spot.bi];
  holder[spot.f] = [line('mine, unsent')];
  global.fetch = async () => ({json: async () => ({ok: true, now: 'T2', records: [
    {key: liveKey, updatedAt: 'T2', lines: [line('theirs')]}]})});
  await pullNow();
  console.log('the cell still shows mine :', /mine, unsent/.test(textOf(holder[spot.f])));
} else {
  console.log('the cell still shows mine : (no matching cell in this build)');
}
`;
eval('(async () => {' + load('data.js') + load('test/fixture.js') + load('render.js') +
     load('editor.js') + load('sync.js') + probe + '})()');
