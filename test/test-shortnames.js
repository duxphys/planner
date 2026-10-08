/* Short forms from the docs workbook's "Short names" tab: "01.A.8 - Practice -
   Models of Constant Velocity" reads "01.A.8 - Prac - Models of Constant
   Velocity" in the planner and on the student pages. Run against Sync.gs. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const gs = fs.readFileSync('apps-script/Sync.gs', 'utf8');
const grab = name => {
  const i = gs.indexOf('function ' + name + '(');
  let d = 0;
  for (let k = gs.indexOf('{', i); k < gs.length; k++) {
    if (gs[k] === '{') d++;
    else if (gs[k] === '}' && --d === 0) return gs.slice(i, k + 1);
  }
};
const docsSection = gs.slice(gs.indexOf("/* ---------- the docs app's names"), gs.indexOf('/* ---------- store'));
const ID = {pr: '1Pq8dLm3VwZpRt7YbN2kFj5HsA9cE4uGo', vt: '1Vt4KcT0pWq2ZrX6vJ8mYb3LdS5fA7eGu', lab: '1Lb5RbN9qWx3LmK7vC2pYj8HdF4sE6aGo'};
const HEAD = ['id', 'item', 'num', 'part', 'name', 'ver', 'role', 'tag', 'mod', 'note', 'students', 'flag', 'file id', 'kind', 'course'];
const row = o => HEAD.map(h => o[h] || '');
const FILES = [HEAD,
  row({'file id': ID.pr, num: '01.A.8', name: 'Practice - Models of Constant Velocity', ver: '26.1', tag: 'amta'}),
  row({'file id': ID.vt, num: '01.B.1', name: 'Video & Textbook Notes - UAM Equations', ver: '26.1'}),
  row({'file id': ID.lab, num: '01.A.4', name: 'Lab - Practice - Carts', ver: '26.1'})];
const SHORT = [['long', 'short'], ['Practice', 'Prac'], ['Video & Textbook Notes', 'V&TNotes']];
const tab = rows => ({getDataRange: () => ({getDisplayValues: () => rows.map(r => r.slice())})});
const run = short => new Function('PropertiesService', 'SpreadsheetApp',
  grab('fileId') + docsSection + '; return docNames();')(
  {getScriptProperties: () => ({getProperty: k => ({DOCS_ID: 'DOCS'})[k] || null})},
  {openById: () => ({getSheetByName: n => n === '_Files' ? tab(FILES) : (n === 'Short names' && short ? tab(short) : null)})});

console.log('--- short forms ---');
const r = run(SHORT), F = r.files || {};
console.log('students see Prac            :', !!F[ID.pr] && F[ID.pr].s === '01.A.8 - Prac - Models of Constant Velocity');
console.log('and I see it, version and all:', !!F[ID.pr] && F[ID.pr].f === '01.A.8 - Prac - Models of Constant Velocity v.26.1 (amta)');
console.log('V&TNotes, as asked           :', !!F[ID.vt] && F[ID.vt].s === '01.B.1 - V&TNotes - UAM Equations');
console.log('only at the start of a name  :', !!F[ID.lab] && F[ID.lab].s === '01.A.4 - Lab - Practice - Carts');
const none = run(null).files || {};
console.log('no tab: the full name        :', !!none[ID.pr] && none[ID.pr].s === '01.A.8 - Practice - Models of Constant Velocity');
const bad = run([['from', 'to'], ['Practice', 'Prac']]);
console.log('a tab without long/short is said:', bad.ok === false && /needs a long and a short column/.test(bad.error || ''));
