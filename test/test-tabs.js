/* Two tabs on one machine, and a tab that is reloaded or closed with edits
   still unsent (audit 23 Sep, items 6 and 7). Each tab runs the real files in
   its own context; they share one localStorage, as two tabs in a browser do,
   and each has its own sessionStorage, which a reload keeps. */
const fs = require('fs'), vm = require('vm');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html', 'utf8')
  .replace(/<link[^>]*>/g, '').replace(/<script[^>]*><\/script>/g, '').replace('<script>start();</script>', '');
const src = ['data.js', 'test/fixture.js', 'render.js', 'editor.js', 'sync.js'].map(f => fs.readFileSync(f, 'utf8')).join('\n');
const disk = {};
const store = m => ({getItem: k => k in m ? m[k] : null, setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }});

function tab(session, opts) {
  opts = opts || {};
  const dom = new JSDOM(html, {pretendToBeVisual: true});
  dom.window.document.execCommand = () => false;
  const ctx = {window: dom.window, document: dom.window.document, console, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: opts.blocked ? {getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }} : store(disk),
    sessionStorage: store(session || {}), navigator: {platform: 'Win32', onLine: opts.offline ? false : true},
    JSON, Date, Math, Object, Array, String, Number, Promise, Error, TypeError, RegExp};
  ctx.window.confirm = () => true;
  vm.createContext(ctx);
  vm.runInContext(src + '\nloadPrefs(); wireToolbar(); wireEditor(); render(); loadSync();' +
    'cfg.url = "https://x/exec"; cfg.token = "t"; cfg.device = "Win32-desk";', ctx);
  ctx.session = session;
  ctx.run = js => vm.runInContext(js, ctx);
  return ctx;
}
const KA = '2026-09-02|P1|cw', KB = '2026-09-03|P1|cw', KC = '2026-09-08|P1|hw';
const line = t => [{bullet: false, private: false, spans: [{t, url: null, rel: false, priv: false}]}];
const onDisk = () => JSON.parse(disk['planner.sync.v1'] || '{}');
const queued = s => Object.keys(s.queue || {}).sort().join(' ');

(async () => {
  console.log('--- two tabs keep their own unsent edits ---');
  const sa = {}, sb = {};
  const A = tab(sa), B = tab(sb);
  A.run(`queue[${JSON.stringify(KA)}] = ${JSON.stringify(line('typed in A'))}; base[${JSON.stringify(KA)}] = 'T1'; saveSync();`);
  B.run(`queue[${JSON.stringify(KB)}] = ${JSON.stringify(line('typed in B'))}; base[${JSON.stringify(KB)}] = 'T1'; saveSync();`);
  console.log('B saving does not erase A\'s edit   :', queued(onDisk()) === [KA, KB].sort().join(' '));
  A.run('saveSync()');
  console.log('nor A saving erase B\'s             :', queued(onDisk()) === [KA, KB].sort().join(' '));
  const tabs = onDisk().tabs || {};
  console.log('each under its own tab             :', Object.keys(tabs).length === 2 &&
    Object.values(tabs).every(t => Object.keys(t.queue).length === 1));
  console.log('each tab has its own device name   :', A.run('me()') !== B.run('me()') &&
    A.run('me()').indexOf('Win32-desk') === 0 && B.run('me()').indexOf('Win32-desk') === 0);
  const C = tab({});
  console.log('a third tab takes neither while both are open:', C.run('Object.keys(queue).length') === 0);

  console.log('');
  console.log('--- a clash between the two tabs keeps both ---');
  let sent = null;
  B.fetch = undefined;
  B.run(`fetch = async (u, o) => { const r = JSON.parse(o.body); if (r.action !== 'push') return {json: async () => ({ok: true, now: 'T2', records: []})};
    globalThis.__sent = r; return {json: async () => ({ok: true, now: 'T2', saved: [], conflicts: [{key: ${JSON.stringify(KB)}, updatedAt: 'T2',
      device: ${JSON.stringify(A.run('me()'))}, lines: ${JSON.stringify(line('typed in A, same cell'))}}]})}; };`);
  await B.run('flush()');
  sent = B.run('globalThis.__sent');
  console.log('B names itself, not the machine     :', !!sent && sent.device === B.run('me()'));
  console.log('A\'s version is kept in the cell    :', /typed in A, same cell/.test(JSON.stringify(B.run(`queue[${JSON.stringify(KB)}]`))));
  console.log('and B\'s below it, private          :', /Kept from this machine/.test(JSON.stringify(B.run(`queue[${JSON.stringify(KB)}]`))) &&
    /typed in B/.test(JSON.stringify(B.run(`queue[${JSON.stringify(KB)}]`))));

  console.log('');
  console.log('--- a reload keeps the tab\'s own edits ---');
  // meanwhile another tab pulled a newer copy of the cell into the shared cache
  { const d0 = onDisk(); d0.base[KA] = 'T5'; disk['planner.sync.v1'] = JSON.stringify(d0); }
  const A2 = tab(sa);
  console.log('A, reloaded, has its edit back      :', A2.run(`JSON.stringify(queue[${JSON.stringify(KA)}])`) === JSON.stringify(line('typed in A')));
  console.log('with the version it was made against:', A2.run(`base[${JSON.stringify(KA)}]`) === 'T1');
  console.log('and not B\'s                         :', A2.run(`queue[${JSON.stringify(KB)}] === undefined`));

  console.log('');
  console.log('--- a tab closed with edits unsent ---');
  const d = onDisk();
  Object.values(d.tabs).forEach(t => { t.at -= 10 * 60000; });
  disk['planner.sync.v1'] = JSON.stringify(d);
  const D = tab({});
  const has = k => D.run(`queue[${JSON.stringify(k)}] !== undefined`);
  console.log('the next tab takes its edits up     :', has(KA) && has(KB));
  console.log('each with its own version           :', D.run(`base[${JSON.stringify(KA)}]`) === 'T1');
  D.run('saveSync()');
  console.log('and they are then its own, once     :', Object.keys(onDisk().tabs).length === 1 && queued(onDisk()) === [KA, KB].sort().join(' '));

  console.log('');
  console.log('--- a store from before this change ---');
  for (const k of Object.keys(disk)) delete disk[k];
  disk['planner.sync.v1'] = JSON.stringify({cfg: {device: 'Win32-old'}, base: {[KC]: 'T9'}, queue: {[KC]: line('left by v53')}});
  const E = tab({});
  console.log('its one queue is taken up           :', E.run(`queue[${JSON.stringify(KC)}] !== undefined`) && E.run(`base[${JSON.stringify(KC)}]`) === 'T9');

  console.log('');
  console.log('--- a write that landed, whoever sent it ---');
  E.run(`fetch = async (u, o) => ({json: async () => ({ok: true, now: 'T10', saved: [], conflicts: [{key: ${JSON.stringify(KC)}, updatedAt: 'T10',
    device: 'Win32-old', lines: ${JSON.stringify(line('left by v53'))}}]})});`);
  await E.run('flush()');
  console.log('is taken as landed, not merged      :', E.run(`queue[${JSON.stringify(KC)}] === undefined`));

  console.log('');
  console.log('--- a failure says what failed ---');
  const F = tab({});
  const note = () => F.document.getElementById('sync').textContent;
  const fail = async (e) => { F.run(`queue = {${JSON.stringify(KA)}: ${JSON.stringify(line('x'))}};`); F.__e = e;
    F.run('fetch = async () => { throw __e; }'); await F.run('flush()'); return note(); };
  console.log('no network is Offline               :', /^Offline — 1 pending/.test(await fail(new F.TypeError('Failed to fetch'))));
  F.__e = null;
  const refuse = async (msg) => { F.run(`queue = {${JSON.stringify(KA)}: ${JSON.stringify(line('x'))}};`);
    F.run(`fetch = async () => ({json: async () => ({ok: false, error: ${JSON.stringify(msg)}})}); clearTimeout(retryTimer);`);
    await F.run('flush()'); return note(); };
  console.log('a bad token says so                 :', /^Token refused — Shift-click Sync to reconnect — 1 pending/.test(await refuse('bad token')));
  console.log('a busy server says so               :', /^Server busy, trying again — 1 pending/.test(await refuse('busy, try again')));
  const stale = await refuse('unknown action: docs');
  console.log('anything else is named              :', /^Sync failed: unknown action: docs/.test(stale) && !/Offline/.test(stale));
  const page = '<!DOCTYPE html><html><head><title>Error</title></head><body>Sorry, unable to open the file at this time.</body></html>';
  F.run(`asked = 0; fetch = async () => { asked++; return {status: 200, text: async () => ${JSON.stringify(page)}}; };`);
  F.run(`queue = {${JSON.stringify(KA)}: ${JSON.stringify(line('x'))}};`);
  await F.run('flush()');
  console.log('a page is asked about twice, no more:', F.run('asked') === 2);
  console.log('then named: action, title          :', /^Sync failed: push: the endpoint sent a page titled "Error" instead of data, twice/.test(note()));
  F.run(`asked = 0; fetch = async (u, o) => { asked++; return asked === 1 ? {status: 200, text: async () => ${JSON.stringify(page)}}
    : {status: 200, text: async () => JSON.stringify({ok: true, now: 'T1', saved: [{key: ${JSON.stringify(KA)}, updatedAt: 'T1'}], conflicts: []})}; };`);
  F.run(`queue = {${JSON.stringify(KA)}: ${JSON.stringify(line('x'))}}; clearTimeout(retryTimer);`);
  await F.run('flush()');
  console.log('one stray page is ridden over      :', F.run('Object.keys(queue).length') === 0 && !/page/.test(note()));
  F.run(`fetch = async () => ({status: 200, text: async () => { throw new TypeError('Failed to fetch'); }});`);
  F.run(`queue = {${JSON.stringify(KA)}: ${JSON.stringify(line('x'))}}; clearTimeout(retryTimer);`);
  await F.run('flush()');
  console.log('a dropped reply is still Offline    :', /^Offline/.test(note()));
  F.run(`fetch = async () => ({json: async () => ({ok: false, error: 'bad token'})});`);
  await F.run('startSync()');
  console.log('start-up with a bad token says so   :', /^Token refused/.test(note()) && !/Offline/.test(note()));
  F.run('clearTimeout(retryTimer)');
  const G = tab({}, {blocked: true});
  G.run(`queue = {${JSON.stringify(KA)}: ${JSON.stringify(line('x'))}}; fetch = async () => { throw new TypeError('Failed to fetch'); };`);
  await G.run('flush()');
  console.log('storage refused is said             :', /not kept: this browser refused to store them/.test(G.document.getElementById('sync').textContent));
  G.run('clearTimeout(retryTimer)');
  process.exit(process.exitCode || 0);
})();
