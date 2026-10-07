/* Anything that only reports something must work from the Apps Script editor as
   well as the spreadsheet menu. getUi() exists only in the spreadsheet, so
   running checkHealth from the editor used to throw instead of answering. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const gs = fs.readFileSync('apps-script/Sync.gs', 'utf8');

const body = name => {
  const i = gs.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0;
  for (let k = gs.indexOf('{', i); k < gs.length; k++) {
    if (gs[k] === '{') d++;
    else if (gs[k] === '}') { d--; if (!d) return gs.slice(i, k + 1); }
  }
  return '';
};

console.log('--- say() falls back when there is no spreadsheet ---');
/* the stubs are scoped inside a function so they cannot clobber the real
   console this test is reporting through */
function runSay(hasUi, msg) {
  const out = {alerted: null, logged: null};
  const src = `
    var SpreadsheetApp = {getUi: function () { ${hasUi
      ? 'return {alert: function (m) { out.alerted = m; }};'
      : 'throw new Error("Cannot call SpreadsheetApp.getUi() from this context.");'} }};
    var Logger = {log: function (m) { out.logged = m; }};
    var console = {log: function (m) { out.logged = m; }};
    ${body('say')}
    say(msg);
  `;
  new Function('out', 'msg', src)(out, msg);
  return out;
}
const inSheet = runSay(true, 'from the menu');
console.log('in the spreadsheet -> alert :', inSheet.alerted === 'from the menu');
let threw = false, inEditor = {};
try { inEditor = runSay(false, 'from the editor'); } catch (e) { threw = true; }
console.log('in the editor      -> log   :', inEditor.logged === 'from the editor');
console.log('  and it does not throw     :', !threw);

console.log('');
console.log('--- the reports use it ---');
for (const fn of ['checkHealth', 'showToken', 'recordCount', 'publishNow', 'backupNow']) {
  const b = body(fn);
  const bad = /SpreadsheetApp\.getUi\(\)\.alert\(/.test(b);
  console.log('  ' + fn.padEnd(16), b ? (bad ? 'STILL NEEDS THE MENU' : 'works either way') : '(not present)');
}

console.log('');
console.log('--- the ones that ask a question say where to go ---');
const ask = body('mustAsk');
console.log('names the menu     :', /Planner sync/.test(ask));
for (const fn of ['withdrawColleagueLinks']) {
  const b = body(fn);
  console.log('  ' + fn.padEnd(24), /mustAsk\(\)/.test(b) ? 'asks properly' : 'CHECK THIS');
}

console.log('');
console.log('--- the menu itself still builds ---');
console.log('onOpen creates it  :', /createMenu\('Planner sync'\)/.test(body('onOpen')));
