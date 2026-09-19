const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
document.execCommand = () => true;
const mem = {};
global.localStorage = {getItem: k => k in mem ? mem[k] : null, setItem: (k,v) => mem[k]=String(v)};
Object.defineProperty(globalThis, 'navigator', {value:{platform:'Test'}, configurable:true});

// a stand-in endpoint that behaves the way Sync.gs does
const store = {};
let calls = [];
global.fetch = async (url, opt) => {
  const req = JSON.parse(opt.body);
  calls.push(req.action);
  if (req.token !== 'good') return {json: async () => ({ok:false, error:'bad token'})};
  const now = new Date(Date.now() + calls.length * 1000).toISOString();
  if (req.action === 'pull') {
    const records = Object.entries(store)
      .filter(([, v]) => !req.since || v.updatedAt > req.since)
      .map(([key, v]) => ({key, updatedAt: v.updatedAt, device: v.device, lines: v.lines}));
    return {json: async () => ({ok:true, now, records})};
  }
  if (req.action === 'push') {
    const saved = [], conflicts = [];
    for (const rec of req.records) {
      const have = store[rec.key];
      if (have && have.updatedAt !== (rec.base || '')) {
        conflicts.push({key: rec.key, updatedAt: have.updatedAt, device: have.device, lines: have.lines});
        continue;
      }
      store[rec.key] = {updatedAt: now, device: req.device, lines: rec.lines};
      saved.push({key: rec.key, updatedAt: now});
    }
    return {json: async () => ({ok:true, now, saved, conflicts})};
  }
  return {json: async () => ({ok:true, now})};
};
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
loadSync(); cfg.url = 'https://fake/exec'; cfg.token = 'good';

(async () => {
  const cell = [...document.querySelectorAll('.cell.sub[data-f]')]
    .find(c => (recOf(c)[c.dataset.f]||[]).length);
  const key = recKey(cell.dataset.w, cell.dataset.d, cell.dataset.bi, cell.dataset.f);
  console.log('record key            :', key);
  const back = findRecord(key);
  console.log('key resolves to a cell:', back && back.w == cell.dataset.w &&
    back.d == cell.dataset.d && back.bi == cell.dataset.bi && back.f === cell.dataset.f);

  // an ASP record and its block record must not collide
  const asp = [...document.querySelectorAll('.cell.sub[data-f]')]
    .find(c => WEEKS[c.dataset.w].days[c.dataset.d].blocks[c.dataset.bi].asp);
  const aspKey = recKey(asp.dataset.w, asp.dataset.d, asp.dataset.bi, asp.dataset.f);
  const twin = WEEKS[asp.dataset.w].days[asp.dataset.d].blocks
    .findIndex(b => b.course && b.period === WEEKS[asp.dataset.w].days[asp.dataset.d].blocks[asp.dataset.bi].period && !b.asp);
  console.log('ASP key differs from its block:',
    aspKey !== recKey(asp.dataset.w, asp.dataset.d, twin, 'cw'), '(' + aspKey + ')');

  // push
  syncChange(cell, recOf(cell)[cell.dataset.f]);
  await new Promise(r => setTimeout(r, 20));
  console.log('pushed and confirmed  :', !!store[key] && Object.keys(queue).length === 0);
  console.log('version stamp is the servers:', base[key] === store[key].updatedAt);

  // someone else writes it, then we push a stale copy
  store[key] = {updatedAt: '2099-01-01T00:00:00.000Z', device: 'other-mac', lines: [{bullet:false, private:false, spans:[{t:'theirs', url:null, rel:false}]}]};
  let asked = 0;
  window.confirm = () => { asked++; return false; };
  queue[key] = [{bullet:false, private:false, spans:[{t:'mine', url:null, rel:false}]}];
  await flush();
  await new Promise(r => setTimeout(r, 20));
  /* The old behaviour asked, and threw one version away on either answer. Now
     both are kept: theirs is the cell, mine is folded in below as teacher-only
     lines, and the decision is an ordinary edit made later. */
  const now = recOf(cell)[cell.dataset.f];
  const said = (now || []).filter(Boolean).map(l => l.spans.map(s => s.t).join('')).join(' | ');
  console.log('no dialog interrupted :', asked === 0);
  console.log('their version is there:', /theirs/.test(said));
  console.log('and mine is too       :', /mine/.test(said));
  console.log('mine is teacher-only  :', (now || []).filter(Boolean)
    .filter(l => /mine|Kept from this machine/.test(l.spans.map(s => s.t).join('')))
    .every(l => l.private === true));
  clearTimeout(retryTimer);                       // let the process end

  // --- a reload: fresh page, same storage, records must come back ---
  store['2026-09-02|P1|cw'] = {updatedAt: '2030-01-01T00:00:00.000Z', device: 'desktop',
    lines: [{bullet:false, private:false, spans:[{t:'written yesterday', url:null, rel:false, priv:false}]}]};
  const saved = localStorage.getItem('planner.sync.v1');
  console.log('lastPull is not persisted:', !('lastPull' in JSON.parse(saved)));
  // simulate the reload: clear in-memory state, keep storage
  lastPull = 'ZZZZ-later-than-anything';
  loadSync();
  console.log('reload resets to full pull:', lastPull === '');
  await pullNow();
  const at = findRecord('2026-09-02|P1|cw');
  const got = WEEKS[at.w].days[at.d].blocks[at.bi][at.f];
  console.log('work from another machine came back:', !!got && got[0].spans[0].t === 'written yesterday');

  // offline: the queue survives and is retried
  const good = global.fetch;
  global.fetch = async () => { throw new Error('offline'); };
  queue['2026-09-03|P1|cw'] = null;
  await flush();
  console.log('offline keeps queue   :', Object.keys(queue).length === 1,
              '| note:', document.getElementById('sync').textContent);
  console.log('queue persisted       :', '2026-09-03|P1|cw' in JSON.parse(localStorage.getItem('planner.sync.v1')).queue);
  global.fetch = good;
})();

// the app legitimately schedules a retry; stop it so the process can end
clearTimeout(retryTimer);
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
