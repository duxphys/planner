/* The record store: it must not stop accepting saves when the tab runs out of
   rows, and a copy of it must reach Drive every week without ever costing a
   save. Sync.gs runs for real here, against an in-memory sheet that refuses a
   range past its last row the way Apps Script does. */
const fs = require('fs');
const vm = require('vm');
process.chdir(require('path').join(__dirname, '..'));
const SRC = fs.readFileSync('apps-script/Sync.gs', 'utf8');
const DAY = 86400000;

function world(opt) {
  opt = opt || {};
  const props = {TOKEN: 'good', SHEET_ID: 'PLAN'};
  const sheet = {
    rows: [['key', 'updatedAt', 'device', 'json']], max: opt.max || 1000,
    getLastRow() { return this.rows.length; },
    getMaxRows() { return this.max; },
    insertRowsAfter(after, n) { this.max += n; this.grew = (this.grew || 0) + n; },
    getRange(r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      // Apps Script refuses a range that runs past the sheet's last row
      if (r + nr - 1 > this.max) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      const sh = this;
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = sh.rows[r - 1 + i] || [];
            out.push(Array.from({length: nc}, (_, j) => row[c - 1 + j] === undefined ? '' : row[c - 1 + j]));
          }
          return out;
        },
        setValues(v) {
          v.forEach((row, i) => {
            const at = r - 1 + i;
            while (sh.rows.length <= at) sh.rows.push(['', '', '', '']);
            row.forEach((x, j) => { sh.rows[at][c - 1 + j] = x; });
          });
          return this;
        },
        setFontWeight() { return this; }
      };
    },
    setFrozenRows() {}, hideSheet() {}
  };
  const files = [], tries = {n: 0};
  let clock = Date.parse('2026-10-07T15:00:00Z');
  const folder = name => ({
    name, getUrl: () => 'https://drive/' + name,
    createFile(n, body) {
      tries.n++;
      if (opt.driveFails) throw new Error('Drive is having a moment');
      const f = {name: n, body, made: clock, trashed: false, folder: name,
                 getName: () => n, getDateCreated: () => new Date(f.made),
                 setTrashed(t) { f.trashed = t; }};
      files.push(f);
      return f;
    },
    getFilesByName(n) { const l = files.filter(f => f.folder === name && !f.trashed && f.name === n); return iter(l); },
    getFiles() { return iter(files.filter(f => f.folder === name && !f.trashed)); }
  });
  const folders = {};
  const iter = l => { let i = 0; return {hasNext: () => i < l.length, next: () => l[i++]}; };
  const ctx = {
    console: {log() {}, error() {}},
    Logger: {log() {}},
    Date: class extends Date { constructor(...a) { a.length ? super(...a) : super(clock); } static now() { return clock; } },
    PropertiesService: {getScriptProperties: () => ({
      getProperty: k => props[k] === undefined ? null : props[k],
      setProperty: (k, v) => { props[k] = String(v); },
      deleteProperty: k => { delete props[k]; }})},
    LockService: {getScriptLock: () => ({tryLock: () => true, releaseLock() {}})},
    SpreadsheetApp: {openById: () => ({getSheetByName: n => n === '_Records' ? sheet : null}),
                     getActiveSpreadsheet: () => ({getId: () => 'PLAN'}), flush() {},
                     getUi() { throw new Error('no UI'); }},
    DriveApp: {getFoldersByName: n => iter(folders[n] ? [folders[n]] : []),
               createFolder: n => (folders[n] = folder(n))},
    ContentService: {createTextOutput: s => ({s, setMimeType() { return this; }}), MimeType: {JSON: 'json'}},
    Utilities: {getUuid: () => 'u', formatDate: (d, tz, f) => new Date(d).toISOString().slice(0, 10)},
    Session: {getScriptTimeZone: () => 'America/New_York'}
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const push = recs => {
    let r;
    try { r = JSON.parse(ctx.doPost({postData: {contents: JSON.stringify(
      {token: 'good', action: 'push', device: 'test', records: recs})}}).s); }
    catch (e) { r = {ok: false, error: 'threw: ' + e.message}; }
    return r;
  };
  return {ctx, sheet, files, props, push, tries, later: ms => { clock += ms; }, live: () => files.filter(f => !f.trashed)};
}
const rec = (k, t) => ({key: k, base: '', lines: [{bullet: false, private: false, spans: [{t: t || k, url: null, rel: false}]}]});
const many = (from, n) => Array.from({length: n}, (_, i) => rec('2026-10-' + (from + i) + '|1|cw'));

console.log('--- the record tab grows instead of refusing a save ---');
{
  const w = world({max: 1000});
  w.sheet.rows = w.sheet.rows.concat(Array.from({length: 997}, (_, i) => ['k' + i, '2026-09-01T00:00:00.000Z', 'x', '[]']));
  const r = w.push(many(1000, 5));                 // 998 rows used, five more needed
  console.log('the save went through        :', r.ok === true && (r.saved || []).length === 5, r.ok ? '' : '(' + r.error + ')');
  console.log('all five rows are on the tab :', w.sheet.rows.length === 1003);
  console.log('with room left for the next  :', w.sheet.getMaxRows() - w.sheet.getLastRow() >= 100);
}
{
  const w = world({max: 1000});
  w.push(many(1, 3));
  console.log('a tab with room is left alone:', !w.sheet.grew);
}

console.log('');
console.log('--- a copy of the records reaches Drive ---');
{
  const w = world();
  w.push(many(1, 3));
  const got = w.live();
  console.log('the first save makes a backup :', got.length === 1);
  let body = null;
  try { body = JSON.parse(got[0] ? got[0].body : ''); } catch (e) { body = null; }
  console.log('it holds every record         :', !!body && Array.isArray(body.records) && body.records.length === 3);
  console.log('exactly as stored             :', !!body && body.records[0].key === '2026-10-1|1|cw' &&
    body.records[0].json === w.sheet.rows[1][3] && body.records[0].updatedAt === w.sheet.rows[1][1]);
  console.log('and says which code made it   :', !!body && /^v\d+/.test(body.version));
  console.log('in a folder of its own        :', !!got[0] && got[0].folder === 'Planner backups');

  w.later(2 * DAY); w.push(many(10, 1));
  console.log('not again two days later      :', w.live().length === 1);
  w.later(6 * DAY); w.push(many(11, 1));
  console.log('again a week after the last   :', w.live().length === 2);

  for (let i = 0; i < 12; i++) { w.later(8 * DAY); w.push(many(1, 1)); }
  let KEEP = -1;
  try { KEEP = vm.runInContext('KEEP_BACKUPS', w.ctx); } catch (e) { KEEP = -1; }
  console.log('only the newest are kept      :', KEEP > 0 && w.live().length === KEEP, '(' + w.live().length + ' of ' + w.files.length + ')');
  const newest = w.live().map(f => f.made).sort().pop();
  console.log('and the newest is among them  :', newest === Math.max(...w.files.map(f => f.made)));
}

console.log('');
console.log('--- a backup that fails never costs a save ---');
{
  const w = world({driveFails: true});
  const r = w.push(many(1, 2));
  console.log('the save still succeeds       :', r.ok === true && (r.saved || []).length === 2);
  console.log('and the records are stored    :', w.sheet.rows.length === 3);
  const why = w.props.BACKUP_ERROR || '';
  console.log('the failure is kept to report :', /Drive is having a moment/.test(why));
  w.later(3600000); w.push(many(5, 1));
  console.log('not retried on every save     :', w.tries.n === 1);
  w.later(DAY); w.push(many(6, 1));
  console.log('but tried again the next day  :', w.tries.n === 2);
}
