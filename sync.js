/* Sync.
 *
 * The endpoint owns the records; this is a client with a cache. Nothing here
 * invents a timestamp — every version stamp comes back from the server, so
 * three machines with three slightly wrong clocks never enters into it.
 *
 * The URL and token live in this browser's storage, one machine at a time, and
 * are never in the repo.
 *
 * Records are keyed by date and period rather than by grid position, so a plan
 * belongs to a class meeting rather than to a slot in a week.
 */

const SYNC_KEY = 'planner.sync.v1';
const RETRY_MS = 20000;

let cfg = {url: '', token: '', device: ''};
let base = {};                 // key -> the updatedAt we last saw from the server
let queue = {};                // key -> lines waiting to go out
let lastPull = '';
let titles = {};               // url -> document name, so we ask Drive once

/* Absences are read from the gradebook and kept in memory ONLY. They carry
   student names, and a school machine's browser storage is the last place
   those should end up — so this is deliberately absent from saveSync(). */
let absent = {};               // keyed 'P1|9/14', holding lines of codes and names
let absentNote = '';           // why they are missing, when they are
const ABSENT_CODES = ['AB', 'T', 'TE', 'TX'];
let syncing = false, retryTimer = null;
let chain = 0;                 // consecutive follow-up sends, so a refusal cannot spin
let srvVersion = '';           // which deployment answered last, named in any failure

function loadSync() {
  try {
    const s = JSON.parse(localStorage.getItem(SYNC_KEY) || '{}');
    cfg = Object.assign(cfg, s.cfg || {});
    base = s.base || {};
    queue = s.queue || {};
    titles = s.titles || {};
    /* lastPull is deliberately NOT restored. The model is rebuilt from data.js
       on every load, so the client starts each session knowing nothing — an
       incremental pull would ask for "changes since my last write" and get back
       nothing, leaving the page showing stale built-in content. The first pull
       of a session is always a full one; later pulls in the same session can be
       incremental because the model is live by then. */
    lastPull = '';
  } catch (e) { /* first run, or storage unavailable */ }
  if (!cfg.device) {
    cfg.device = (navigator.platform || 'browser').split(' ')[0] + '-' +
                 Math.random().toString(36).slice(2, 6);
  }
}

function saveSync() {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify({cfg, base, queue, titles}));
  } catch (e) { /* storage unavailable: the queue lives only for this session */ }
}

/* ---------- record keys ---------- */

/** date + period, with ASP marked, e.g. 2026-09-02|P5a|cw */
function recKey(w, d, bi, f) {
  const day = WEEKS[w].days[d];
  if (!day.iso) return null;
  if (f === 'note' || f === 'off') return day.iso + '|day|' + f;
  const b = day.blocks[bi];
  if (!b) return null;
  if (f === 'prep') return day.iso + '|P' + b.period + (b.asp ? 'a' : '') + '|prep';
  if (!b.course) return null;
  return day.iso + '|P' + b.period + (b.asp ? 'a' : '') + '|' + f;
}

/** the reverse, so a pulled record can find its cell */
function findRecord(key) {
  const [iso, per, f] = String(key).split('|');
  if (per === 'day') {
    const field = f === 'off' ? 'offLines' : 'noteLines';
    for (const [w, wk] of WEEKS.entries())
      for (const [d, day] of wk.days.entries())
        if (day.iso === iso) return {w, d, bi: null, f: field};
    return null;
  }
  const asp = per.endsWith('a');
  const p = parseInt(per.replace(/^P|a$/g, ''), 10);
  const wantPrep = f === 'prep';                     // prep blocks have no course
  for (const [w, wk] of WEEKS.entries())
    for (const [d, day] of wk.days.entries()) {
      if (day.iso !== iso) continue;
      for (const [bi, b] of day.blocks.entries())
        if (b.period === p && !!b.asp === asp && (wantPrep ? !b.course : !!b.course))
          return {w, d, bi, f};
    }
  return null;
}

/* ---------- transport ---------- */

/* text/plain on purpose: application/json makes the browser send a preflight,
   and Apps Script has no way to answer one. The server parses the body either
   way, so the request stays "simple" and the round trip works. */
/* Apps Script answers a POST with a 302 to script.googleusercontent.com, and a
   browser following a 302 turns POST into GET and drops the body. It normally
   works because the redirect carries the result; when it does not, the request
   arrives at doGet with no parameters and comes back as the student-page error.
   Every action here is safe to repeat, so a converted request is simply sent
   again rather than reported as a failure. */
const LOST_POST = /which class\?|expects a post/i;

async function call(action, body, again) {
  if (!cfg.url || !cfg.token) throw new Error('not connected');
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {'Content-Type': 'text/plain;charset=utf-8'},
    body: JSON.stringify(Object.assign({action, token: cfg.token, device: cfg.device}, body))
  });
  const data = await res.json();
  if (data && data.version) srvVersion = data.version;
  if (!data.ok) {
    if (LOST_POST.test(data.error || '') && !again) {
      console.warn('POST became a GET in transit; sending ' + action + ' again');
      return call(action, body, true);
    }
    throw new Error(data.error || 'endpoint refused');
  }
  return data;
}

/* ---------- pull ---------- */

async function pullNow() {
  const data = await call('pull', {since: lastPull});
  let applied = 0, missed = 0;
  for (const rec of data.records || []) {
    /* A cell we are still holding an unsent edit for keeps the version that
       edit was made against. Advancing it here was quietly disarming the
       version guard: the push then carried the server's own current version as
       its base, the comparison matched, and the edit replaced whatever another
       machine had saved in the meantime with nothing raised. */
    if (queue[rec.key] !== undefined) continue;
    base[rec.key] = rec.updatedAt;
    const at = findRecord(rec.key);
    if (!at) { missed++; continue; }       // a date or class not in this build
    const holder = at.bi === null ? WEEKS[at.w].days[at.d] : WEEKS[at.w].days[at.d].blocks[at.bi];
    holder[at.f] = rec.lines && rec.lines.length ? rec.lines : null;
    applied++;
  }
  if (missed) console.warn('sync: ' + missed + ' record(s) had no matching cell');
  lastPull = data.now;
  saveSync();
  if (applied) render();
  return applied;
}

/* ---------- push ---------- */

/** called when a cell closes; the write goes out on the next flush */
function syncChange(cell, lines) {
  const key = recKey(cell.dataset.w, cell.dataset.d, cell.dataset.bi, cell.dataset.f);
  if (!key) return;
  queue[key] = lines || null;
  saveSync();
  flush();
}

async function flush() {
  if (syncing || !cfg.url) return;
  const keys = Object.keys(queue);
  if (!keys.length) { setNote('Up to date'); return; }
  syncing = true;
  let flushAgain = false;
  setNote('Saving\u2026');
  try {
    const records = keys.map(k => ({key: k, lines: queue[k], base: base[k] || ''}));
    const data = await call('push', {records});
    for (const s of data.saved || []) {
      base[s.key] = s.updatedAt;
      delete queue[s.key];                 // only clear what the server confirmed
    }
    for (const c of data.conflicts || []) {
      base[c.key] = c.updatedAt;
      /* A conflict with MYSELF is not a conflict. On a poor connection a push
         can reach the server and have its reply lost on the way back — the
         record is saved, but this machine still thinks it failed, so it retries
         with a base the server has already moved past. The rejection then names
         this very device. Take the write as landed and stop asking. */
      if (c.device && c.device === cfg.device) {
        if (sameLines(queue[c.key], c.lines)) {
          delete queue[c.key];               // it was already saved: nothing to do
        } else {
          flushAgain = true;                 // ours is newer; send it over the top
        }
        continue;
      }
      if (onConflict(c)) flushAgain = true;
    }
    lastPull = data.now;
    saveSync();
    setNote(Object.keys(queue).length ? Object.keys(queue).length + ' pending' : 'Saved');
  } catch (err) {
    saveSync();                                 // don't rely on the caller having saved
    setNote('Offline \u2014 ' + Object.keys(queue).length + ' pending');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(flush, RETRY_MS);   // the queue is on disk; it can wait
  } finally {
    syncing = false;
  }
  // a write of our own that needs resending with the base the server now holds
  /* A send that has to be followed by another one — a reply that went missing,
     or a merge that still has to go up. Bounded, because a server that keeps
     refusing would otherwise spin here forever and never say so. */
  if (!flushAgain) { chain = 0; return; }
  if (chain >= 3) {
    chain = 0;
    setNote(Object.keys(queue).length + ' pending \u2014 will retry');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(flush, RETRY_MS);
    return;
  }
  chain++;
  flush();
}

/** are two sets of lines the same text, links and flags? */
function sameLines(a, b) {
  const norm = ls => JSON.stringify((ls || []).map(l => l && ({
    b: !!l.bullet, p: !!l.private,
    s: l.spans.map(sp => [sp.t, sp.url || '', !!sp.rel, !!sp.priv])
  })));
  return norm(a) === norm(b);
}

/**
 * Someone else wrote this record while we were away. The write is refused
 * rather than applied, and both versions are kept: theirs goes into the grid,
 * ours stays queued and is offered back. Last-writer-wins is how an evening
 * of planning disappears without anyone noticing.
 */
/**
 * Two machines wrote the same cell. Keep both.
 *
 * Theirs becomes the cell, because that is what the server holds and what every
 * other machine is already showing. Mine is folded in underneath as private
 * lines — teacher-only, never published — under a line saying where it came
 * from. Choosing between them is then an ordinary edit, made while looking at
 * both, instead of a dialog answered by reflex in the middle of typing.
 *
 * This used to ask, and drop my version on either answer: Cancel discarded it,
 * and a cell outside this build discarded it without even asking.
 */
function onConflict(c) {
  const mine = queue[c.key];
  const theirs = c.lines && c.lines.length ? c.lines : null;
  const merged = keepBoth(theirs, mine, c);
  const at = findRecord(c.key);

  queue[c.key] = merged;                  // never dropped, whatever happens next
  if (at) {
    const rec = at.bi === null ? WEEKS[at.w].days[at.d] : WEEKS[at.w].days[at.d].blocks[at.bi];
    rec[at.f] = merged;
  }
  saveSync();
  setNote('Kept both versions of ' + c.key.split('|').slice(0, 2).join(' '));
  render();
  return true;                            // the merge still has to be sent
}

/** theirs, then mine kept below it as teacher-only lines */
function keepBoth(theirs, mine, c) {
  if (!mine || !mine.length) return theirs;
  const MARK = 'Kept from this machine';
  const textOf = l => l.spans.map(s => s.t).join('');
  const marked = ls => (ls || []).some(l => l && l.private && textOf(l).indexOf(MARK) === 0);
  /* Idempotent. A merge that is refused again comes back through here with the
     merged copy as "mine" — appending once more would stack their version and
     the heading on every retry. Mine already holds both, so keep it as it is. */
  if (marked(mine)) return mine;
  if (marked(theirs)) return theirs;

  const when = (function () {
    const d = new Date(c.updatedAt);
    return isNaN(d.getTime()) ? 'just now' : d.toLocaleString();
  })();
  const head = {bullet: false, private: true, spans: [{
    t: MARK + ' \u2014 ' + (c.device || 'another machine') + ' saved over it at ' + when,
    url: null, rel: false, priv: false}]};
  // every rescued line is private, so none of it can reach a student page
  const rescued = mine.filter(Boolean).map(l => ({bullet: l.bullet, private: true, spans: l.spans}));
  return (theirs || []).concat([null, head], rescued);
}

/* ---------- the calendar, handed to the endpoint ---------- */

/* The endpoint stores records but has no idea which dates are school days or
   what P1 is called. It needs that to publish anything, so the app sends it —
   only when it has actually changed, since it rarely does. */
function calendarPayload() {
  const courses = {};
  for (const w of WEEKS) for (const d of w.days) for (const b of d.blocks) {
    if (b.course && !courses[b.period]) courses[b.period] = b.course;
  }
  const weeks = WEEKS.map(w => ({
    label: w.label, mon: w.mon,
    days: w.days.map(d => ({
      d: d.d, iso: d.iso, cycle: d.cycle, off: d.off || '',
      // for a no-school day the reason may have been edited; the endpoint
      // prefers the note record, but send the seed so a fresh one has something
      blocks: d.blocks.filter(b => b.course)
        .map(b => ({block: b.block, period: b.period, asp: !!b.asp}))
    }))
  }));
  return {weeks, courses};
}

const stamp = o => {                       // cheap change detector
  const t = JSON.stringify(o);
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return String(h) + ':' + t.length;
};

async function sendCalendar() {
  const payload = calendarPayload();
  const mark = stamp(payload);
  if (cfg.calStamp === mark) return 0;
  const d = await call('calendar', payload);
  cfg.calStamp = mark;
  saveSync();
  return d.weeks || 0;
}

/* ---------- absences, read-only ---------- */

async function pullAbsences() {
  const data = await call('absences', {});
  const out = {};
  for (const tag of Object.keys(data.byTag || {})) {
    const days = data.byTag[tag];
    for (const day of Object.keys(days)) {
      const codes = days[day], parts = [];
      // one line per code, so lateness reads separately from absence
      for (const c of ABSENT_CODES) {
        if (codes[c] && codes[c].length) parts.push(c + ': ' + codes[c].join(', '));
      }
      // a day only reaches us once it has been taken, so an empty one means
      // everybody was there — which is worth saying, unlike silence
      out[tag + '|' + day] = parts.length ? parts : ['All here'];
    }
  }
  absent = out;
  const n = Object.keys(out).length;
  // "the gradebook answered with nothing" and "the gradebook could not be read"
  // look identical on screen otherwise, and only one of them is your fault
  absentNote = n ? '' : 'No attendance found — check the Gradebook tab mapping';
  render();
  return n;
}

/* ---------- document titles ---------- */

/** Ask the endpoint what a Drive link is called. Empty means "no idea" — the
 *  caller keeps whatever label it had rather than showing an error. */
async function linkTitle(url) {
  if (!url || !cfg.url || !cfg.token) return '';
  if (titles[url] !== undefined) return titles[url];
  try {
    const d = await call('title', {url});
    titles[url] = d.title || '';
    // a year of pasted links would otherwise grow this without limit
    const keys = Object.keys(titles);
    if (keys.length > 400) for (const k of keys.slice(0, keys.length - 300)) delete titles[k];
    saveSync();
    return titles[url];
  } catch (err) {
    return '';
  }
}

/* ---------- publishing to the student pages ---------- */

/* The endpoint publishes on its own every 15 minutes. This is for when that is
   too slow — you have just fixed something and want it out now. */
async function publishNow(btn) {
  if (!cfg.url || !cfg.token) { setPub('Not connected'); return; }
  setPub('Publishing\u2026');
  try {
    const d = await call('publish', {});
    const n = Object.keys(d.classes || {}).length;
    setPub('Published ' + new Date().toLocaleTimeString(undefined,
      {hour: 'numeric', minute: '2-digit'}));
    if (!n) setPub('Nothing to publish');
  } catch (err) {
    setPub('Publish failed');
  }
}

let pubTimer = null;
function setPub(t) {
  const el = document.getElementById('publish');
  if (!el) return;
  el.title = t || 'Publish to the student pages';
  clearTimeout(pubTimer);
  if (!t && typeof ICONS !== 'undefined') { el.innerHTML = ICONS.send; el.classList.add('ico'); return; }
  el.textContent = t;
  el.classList.remove('ico');
  // say what happened, then go back to being an icon
  if (/^Published/.test(t)) pubTimer = setTimeout(() => setPub(''), 6000);
}

/* ---------- status ---------- */

/* An icon when there is nothing to say, words when there is. "Up to date" is
   worth one glyph; "Offline — 3 pending" has to be readable. */
const QUIET = {'Up to date': 1, 'Saved': 1};

function setNote(t) {
  const el = document.getElementById('sync');
  if (!el) return;
  // hovering Sync on any machine says which deployment that machine is using
  el.title = t + (srvVersion ? '\n' + cfg.url.slice(0, 64) + '\nendpoint ' + srvVersion : '');
  if (QUIET[t] && typeof ICONS !== 'undefined') { el.innerHTML = ICONS.cloud; el.classList.add('ico'); }
  else { el.textContent = t; el.classList.remove('ico'); }
}

function connect() {
  const url = window.prompt(
    'Sync URL (the /exec address)\n\nLeave blank to disconnect this machine.',
    cfg.url || '');
  if (url === null) return;
  if (!url.trim()) { disconnect(); return; }
  const token = window.prompt('Token', cfg.token || '');
  if (token === null) return;
  cfg.url = url.trim();
  cfg.token = token.trim();
  saveSync();
  startSync();
}

/**
 * Forget the token on this machine. The real weak point is not the code being
 * public — it is a school laptop left unlocked with the planner open, where the
 * token can be read straight out of browser storage. Anything still queued is
 * kept, so nothing unsaved is lost by disconnecting.
 */
function disconnect() {
  if (Object.keys(queue).length &&
      !window.confirm(Object.keys(queue).length + ' change(s) have not been sent yet.\n\n' +
        'Disconnect anyway? They stay on this machine until you reconnect.')) return;
  cfg.url = ''; cfg.token = '';
  absent = {}; absentNote = '';
  saveSync();
  setNote('Not connected');
  render();
}

async function startSync() {
  if (!cfg.url || !cfg.token) { setNote('Not connected'); return; }
  setNote('Connecting\u2026');
  try {
    await pullNow();
    await flush();
    try { await sendCalendar(); } catch (err) { /* it can go next time */ }
    // after the grid is up: this one opens another workbook and can be slow
    /* Do not swallow this. A gradebook that cannot be read looks exactly like a
       day when nobody was out, and you would never know which you were seeing. */
    try { absentNote = ''; await pullAbsences(); }
    catch (err) {
      absentNote = 'Absences unavailable' + (srvVersion ? ' (endpoint ' + srvVersion + ')' : '') +
                   ': ' + err.message;
      console.warn(absentNote);
    }
    render();
    setNote(Object.keys(queue).length ? Object.keys(queue).length + ' pending' : 'Up to date');
  } catch (err) {
    setNote('Offline \u2014 ' + (Object.keys(queue).length || 'no') + ' pending');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(startSync, RETRY_MS);
  }
}

function wireSync() {
  loadSync();
  const btn = document.getElementById('sync');
  if (btn) btn.onclick = e => { if (e.shiftKey || !cfg.url) connect(); else startSync(); };
  const pub = document.getElementById('publish');
  if (pub) { pub.onclick = () => publishNow(); setPub(''); }
  window.addEventListener('online', () => startSync());
  setNote(cfg.url ? 'Connecting\u2026' : 'Not connected');
  startSync();
}
