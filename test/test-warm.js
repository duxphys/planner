/* publish() builds the five student pages after its lock is let go, so a save
   arriving meanwhile is not kept waiting behind them (audit 23 Sep, item 8).
   Run for real: the lock, the cache clear and the page build each say when
   they happened. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const gs = fs.readFileSync('apps-script/Sync.gs', 'utf8');
const grab = name => {
  const i = gs.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0;
  for (let k = gs.indexOf('{', i); k < gs.length; k++) {
    if (gs[k] === '{') d++;
    else if (gs[k] === '}' && --d === 0) return gs.slice(i, k + 1);
  }
};
const events = [];
const make = (opts) => new Function('events', 'opts',
  ['publish', 'publishLocked', 'horizonISO', 'iso'].map(grab).join('\n') + `
  var held = false;
  var LockService = {getScriptLock: () => ({
    tryLock: () => { if (opts.busy) return false; held = true; events.push('lock'); return true; },
    releaseLock: () => { held = false; events.push('unlock'); }})};
  var PropertiesService = {getScriptProperties: () => ({setProperty() {}, getProperty: () => null})};
  var CacheService = {getScriptCache: () => ({removeAll: () => events.push('clear' + (held ? ' (locked)' : ''))})};
  var SpreadsheetApp = {flush() {}};
  var PUB_TAB = '_Published', console = {error() {}};
  var getCalendar = () => ({courses: {1: {tag: 'P1'}}, weeks: [{label: 'w', mon: '2026-09-07', days: []}]});
  var readAll = () => ({}), recTab = () => null, gbLinks = () => ({}), docNames = () => ({ok: true, files: {}, count: 0, year: '26'});
  var nowIso = () => '2026-10-08T12:00:00Z', parse = JSON.parse;
  var tab = () => ({getLastRow: () => 0, getRange: () => ({setValues() {}, clearContent() {}})});
  function warmPages() { events.push('build' + (held ? ' (locked)' : '')); }
  return publish();`)(events, opts);

console.log('--- the pages are built after the lock is let go ---');
const r = make({});
console.log('publishing worked                 :', r.ok === true);
console.log('the page copies are cleared, locked:', events.indexOf('clear (locked)') >= 0);
console.log('the pages are built                :', events.some(e => /^build/.test(e)));
console.log('outside the lock                   :', events.indexOf('build') > events.indexOf('unlock') && !events.includes('build (locked)'),
  '(' + events.join(', ') + ')');
events.length = 0;
const b = make({busy: true});
console.log('a busy lock builds nothing         :', b.ok === false && !events.some(e => /^build/.test(e)));

console.log('');
console.log('--- the workbook is opened once a request ---');
{
  let opens = 0;
  const run = new Function('count', ['book', 'tab', 'tabIfAny'].map(grab).join('\n') + `
    var BOOK = null;
    var PropertiesService = {getScriptProperties: () => ({getProperty: () => 'ID'})};
    var SpreadsheetApp = {openById: () => { count(); return {getSheetByName: n => ({name: n}), insertSheet: n => ({name: n, hideSheet() {}})}; }};
    tab('_Records'); tab('_Calendar'); tabIfAny('Courses'); tabIfAny('Build Calendar'); book();`);
  run(() => opens++);
  console.log('five lookups, one open             :', opens === 1, '(' + opens + ')');
}
