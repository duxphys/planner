/* What doGet answers to someone without the token. It is open to anyone who
 * has the address, students included, so each answer here is checked as
 * behaviour, by running doGet itself.
 *
 * v47 closed two doors, found while revising the district data-flow document:
 * - a wrong token on ?check said whether its first four characters were
 *   right, so a guess could be checked four characters at a time;
 * - colleague links (&k=) opened the whole year unredacted, and running
 *   colleagueLink() once from the editor minted a working one again.
 */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const gs = fs.readFileSync('apps-script/Sync.gs', 'utf8');
const fn = name => {
  const i = gs.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0;
  for (let k = gs.indexOf('{', i); k < gs.length; k++) {
    if (gs[k] === '{') d++;
    else if (gs[k] === '}' && --d === 0) return gs.slice(i, k + 1);
  }
};

const TOKEN = 'not-a-real-token-just-for-this-test!';   // not uuid-shaped, or test-security takes it for a leak
const calls = [];
const run = new Function('TOKEN', 'calls', `
  var VERSION = 'test';
  var props = {TOKEN: TOKEN, VIEW_TOKEN: 'kkkk-old-colleague-token', SHEET_ID: 'x'};
  var PropertiesService = {getScriptProperties: function () {
    return {getProperty: function (k) { return props[k] || null; }}; }};
  var ContentService = {MimeType: {JSON: 'json'}, createTextOutput: function (t) {
    return {json: JSON.parse(t), setMimeType: function () { return this; }}; }};
  var console = {error: function () {}};
  function studentPage(tag) { calls.push('studentPage ' + tag); return {page: tag, append: function () {}}; }
  function readPublished(tag) { calls.push('readPublished ' + tag); return {ok: true, tag: tag, weeks: []}; }
  function selfCheck() { calls.push('selfCheck'); return {ok: true, workbook: 'Physics Planner'}; }
  function page(d) { return {page: 'failure', data: d}; }
  function timingHtml() { return ''; }
  ${fn('out')}
  ${fn('doGet')}
  return function (q) { calls.length = 0; return doGet({parameter: q}); };
`)(TOKEN, calls);

console.log('--- the version check ---');
const ping = run({ping: '1'}).json;
console.log('answers with the version only     :',
  Object.keys(ping).sort().join() === 'ok,version' && calls.length === 0);

console.log('');
console.log('--- a wrong token says nothing about the right one ---');
const sameStart = TOKEN.slice(0, 4) + 'x'.repeat(TOKEN.length - 4);
const otherStart = 'x'.repeat(TOKEN.length);
const a = run({check: '1', token: sameStart}).json;
const b = run({check: '1', token: otherStart}).json;
console.log('refused                           :', a.ok === false && b.ok === false && calls.length === 0);
console.log('a right prefix and a wrong one get the same answer:', a.error === b.error, a.error);
console.log('no word of how it starts          :', !/start/i.test(a.error + b.error));
const short = run({check: '1', token: TOKEN.slice(0, 30)}).json;
console.log('a short paste is still spotted    :', /sent 30 characters/.test(short.error));
const good = run({check: '1', token: TOKEN}).json;
console.log('the right token gets the check    :', good.workbook === 'Physics Planner' && calls.join() === 'selfCheck');

console.log('');
console.log('--- colleague links are gone ---');
const kPage = run({'class': 'p1', page: '1', k: 'kkkk-old-colleague-token'});
console.log('a k on a page gets the student page:', kPage.page === 'P1' && calls.join() === 'studentPage P1');
const kJson = run({'class': 'p1', k: 'kkkk-old-colleague-token'}).json;
console.log('a k on the JSON gets the student JSON:', kJson.ok && !kJson.staff && calls.join() === 'readPublished P1');
console.log('nothing in Sync.gs reads VIEW_TOKEN :', !/VIEW_TOKEN/.test(gs));
console.log('no colleague feed or link maker     :',
  !/function (staffFeed|colleagueLink|withdrawColleagueLinks)\(/.test(gs));
