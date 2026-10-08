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

/* setTimeout, but a pending timer must not hold the process open.
 *
 * In a browser this is exactly setTimeout — unref does not exist there. In node,
 * which is where the tests run, a pending timer keeps the event loop alive, so a
 * test that legitimately leaves a record queued would hang the runner instead of
 * exiting. That was previously patched test by test with a clearTimeout at the
 * end of each; doing it here covers every retry path, including ones added
 * later. The timer still fires normally while anything else keeps the loop busy. */
function later(fn, ms) {
  const t = setTimeout(fn, ms);
  if (t && typeof t.unref === 'function') t.unref();
  return t;
}

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
let storeDead = false;         // the browser refused the last save to its storage

/* Each tab keeps its own unsent edits under its own id, so two tabs on one
   machine cannot erase each other's queue, and each sends its own device name,
   so a clash between them is a real conflict - both kept - not a conflict
   "with myself" resent over the top. The id lives in sessionStorage, which a
   reload keeps. A tab's entry untouched for TAB_ORPHAN ms belongs to a tab that
   has gone; the next tab to open takes its edits up, each still carrying the
   version it was made against. */
const TAB_ORPHAN = 5 * 60000;
const TAB = (function () {
  let t = null;
  try { t = sessionStorage.getItem('planner.tab'); } catch (e) {}
  if (!t) {
    t = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try { sessionStorage.setItem('planner.tab', t); } catch (e) {}
  }
  return t;
})();
let adopted = [];              // other tabs' entries taken up, dropped on the next save
const me = () => cfg.device + '.' + TAB.slice(-4);
let chain = 0;                 // consecutive follow-up sends, so a refusal cannot spin
let srvVersion = '';           // which deployment answered last, named in any failure

function loadSync() {
  try {
    const s = JSON.parse(localStorage.getItem(SYNC_KEY) || '{}');
    cfg = Object.assign(cfg, s.cfg || {});
    base = s.base || {};
    queue = {};
    /* Mine, and any tab's that was abandoned. A store from before v54 has one
       shared queue and no tabs: it is taken up as an abandoned tab's. */
    const tabs = s.tabs || (s.queue && Object.keys(s.queue).length ? {legacy: {at: 0, queue: s.queue, base: s.base}} : {});
    Object.keys(tabs).sort((a, b) => (tabs[a].at || 0) - (tabs[b].at || 0)).forEach(id => {
      const t = tabs[id];
      if (id !== TAB && Date.now() - (t.at || 0) < TAB_ORPHAN) return;   // an open tab's
      for (const k of Object.keys(t.queue || {})) {
        queue[k] = t.queue[k];
        if (t.base && t.base[k] !== undefined) base[k] = t.base[k];
      }
      if (id !== TAB) adopted.push(id);
    });
    titles = s.titles || {};
    refCache = s.ref || null;
    docsByFile = s.docs || {};          // last copy read, so a cold start has names
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

/* Read, merge, write: what another tab saved is kept. Each tab's queue is its
   own entry, with the version each edit was made against. The shared base is a
   cold-start cache, newest wins, except for a key this tab holds an edit for.
   `queue` holds every tab's edits together, for anything reading the old
   shape. A refusal is remembered and said, never swallowed. */
function saveSync() {
  try {
    const s = JSON.parse(localStorage.getItem(SYNC_KEY) || '{}');
    const tabs = s.tabs || {};
    for (const id of adopted) delete tabs[id];
    const mine = Object.keys(queue);
    if (mine.length) {
      const b = {};
      for (const k of mine) b[k] = base[k];
      tabs[TAB] = {at: Date.now(), queue, base: b};
    } else delete tabs[TAB];
    const all = {};
    for (const id of Object.keys(tabs)) Object.assign(all, tabs[id].queue);
    const merged = Object.assign({}, s.base || {});
    for (const k of Object.keys(base)) {
      if (!(k in merged) || queue[k] !== undefined || String(base[k]) > String(merged[k])) merged[k] = base[k];
    }
    localStorage.setItem(SYNC_KEY, JSON.stringify({cfg, base: merged, queue: all, tabs, titles, docs: docsByFile, ref: refCache}));
    adopted = [];
    storeDead = false;
  } catch (e) { storeDead = true; }
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
    body: JSON.stringify(Object.assign({action, token: cfg.token, device: me()}, body))
  });
  /* Google now and then answers with a page of its own - an error, a sign-in,
     a "file not found" from the redirect - instead of the script's data. Every
     action is safe to repeat, so it is asked once more; a second page is
     named: which action, the page's title, the HTTP status. A network failure
     while reading is left as one, so it still reads "Offline". */
  const text = typeof res.text === 'function' ? await res.text() : null;
  let data;
  try { data = text === null ? await res.json() : JSON.parse(text); }
  catch (e) {
    if (e instanceof TypeError) throw e;
    if (!again) {
      console.warn(action + ': a page came back instead of data; asking again');
      return call(action, body, true);
    }
    const title = /<title>([^<]*)<\/title>/i.exec(text || '');
    throw new Error(action + ': the endpoint sent a page' + (title ? ' titled "' + title[1].trim() + '"' : '') +
      (res.status && res.status !== 200 ? ' (HTTP ' + res.status + ')' : '') + ' instead of data, twice');
  }
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
  let applied = 0, missed = 0, held = 0;
  /* A cell open for editing has no queue entry yet — the text is still only in
     the DOM — so the guard below did not cover it, and its base advanced to the
     server's current stamp. Closing the cell then pushed against a base that
     matched and overwrote another machine with nothing raised: the same failure
     as the disarmed guard, through a different door. Treat an open cell exactly
     like a queued one. */
  const open = typeof editingKey === 'function' ? editingKey() : null;
  for (const rec of data.records || []) {
    if (open && rec.key === open) { held++; continue; }
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
  if (held) console.warn('sync: ' + held + ' record(s) left alone — open for editing');
  lastPull = data.now;
  saveSync();
  if (applied) render();
  return applied;
}

/* ---------- push ---------- */

/** called when a cell closes; the write goes out on the next flush */
function syncChange(cell, lines) {
  if (syncKeyChange(cell.dataset.w, cell.dataset.d, cell.dataset.bi, cell.dataset.f, lines)) flush();
}

/** the same, for a cell that has no element on screen to read the position off */
function syncKeyChange(w, d, bi, f, lines) {
  const key = recKey(w, d, bi, f);
  if (!key) return false;
  queue[key] = lines || null;
  saveSync();
  return true;
}

async function flush() {
  if (syncing || !cfg.url) return;
  const keys = Object.keys(queue);
  if (!keys.length) { setNote('Up to date'); return; }
  syncing = true;
  let flushAgain = false, progress = false;
  setNote('Saving\u2026');
  try {
    const records = keys.map(k => ({key: k, lines: queue[k], base: base[k] || ''}));
    /* What we actually sent, so a cell edited again DURING the round trip is not
       mistaken for the version the server just confirmed. */
    const sent = {};
    for (const k of keys) sent[k] = queue[k];
    const data = await call('push', {records});
    for (const s of data.saved || []) {
      base[s.key] = s.updatedAt;
      /* Only clear what the server confirmed — and only if the queue still holds
         what we sent. Closing the same cell again while this push was in flight
         leaves a NEWER edit under that key, and deleting it here lost it with
         nothing shown. */
      if (sameLines(queue[s.key], sent[s.key])) delete queue[s.key];
      progress = true;
    }
    for (const c of data.conflicts || []) {
      base[c.key] = c.updatedAt;
      /* The server already holds exactly this: it landed, whoever sent it. */
      if (sameLines(queue[c.key], c.lines)) { delete queue[c.key]; continue; }
      /* A conflict with MYSELF is not a conflict. On a poor connection a push
         can reach the server and have its reply lost on the way back — the
         record is saved, but this machine still thinks it failed, so it retries
         with a base the server has already moved past. The rejection then names
         this very device. Take the write as landed and stop asking. */
      if (c.device && c.device === me()) {
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
    setNote(failNote(err));
    clearTimeout(retryTimer);
    retryTimer = later(flush, RETRY_MS);   // the queue is on disk; it can wait
  } finally {
    syncing = false;
  }
  // a write of our own that needs resending with the base the server now holds
  /* A send that has to be followed by another one — a reply that went missing,
     or a merge that still has to go up. Bounded, because a server that keeps
     refusing would otherwise spin here forever and never say so. */
  if (!flushAgain) {
    chain = 0;
    /* An edit made while that push was in flight hit the `syncing` guard at the
       top and returned without queueing a retry, so it sat here unsent until the
       next time a cell happened to close. If anything is still queued, go again:
       straight away when the last push made progress, and after the normal retry
       delay when it did not, so a record the server never answers for cannot
       spin this in a loop. */
    if (Object.keys(queue).length) {
      clearTimeout(retryTimer);
      retryTimer = later(flush, progress ? 0 : RETRY_MS);
    }
    return;
  }
  if (chain >= 3) {
    chain = 0;
    setNote(Object.keys(queue).length + ' pending \u2014 will retry');
    clearTimeout(retryTimer);
    retryTimer = later(flush, RETRY_MS);
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

/* ---------- reference-in: Courses and Build Calendar ---------- */

/* data.js stays the record of the weeks it has. From the workbook come course
   names, sections and colours, by date - so P7's lab can stop on 22 Jan and
   P6's start on 25 Jan - and the school days after data.js's last week, from
   Build Calendar. The last copy read is kept on this machine, so the new weeks
   are there offline. A copy with a problem in it is not used at all. */
const BASE_WEEKS = WEEKS.length;
const BASE_COURSES = WEEKS.map(w => w.days.map(d => d.blocks.map(b => b.course)));
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let refNote = '', refCache = null, refApplied = '', refAppliedNote = '';

const pad2 = n => String(n).padStart(2, '0');
const dateOf = iso => { const p = iso.split('-'); return new Date(+p[0], p[1] - 1, +p[2], 12); };
const isoAdd = (iso, n) => { const t = dateOf(iso); t.setDate(t.getDate() + n);
  return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate()); };
/* The waterfall: day 1 runs P1-P5, and each day starts five periods on. ASP
   meets whoever had Block 5. */
const rotation = k => [0, 1, 2, 3, 4].map(i => ((k - 1) * 5 + i) % 7 + 1);

function courseFor(courses, period, iso) {
  const c = courses.find(c => c.period === period && (!c.from || iso >= c.from) && (!c.until || iso <= c.until));
  return c ? {sym: c.sym, tag: 'P' + period, name: c.name, sec: c.sec, fill: c.fill, ink: c.ink} : null;
}

function referenceWeeks(ref, problems) {
  const cal = ref.calendar, courses = ref.courses || [];
  if (!cal) return {weeks: [], note: ''};
  const days0 = WEEKS[BASE_WEEKS - 1].days, last0 = days0[days0.length - 1].iso;
  let lastCycle = 0;
  for (const w of WEEKS.slice(0, BASE_WEEKS)) for (const d of w.days) if (d.cycle) lastCycle = d.cycle;
  let mon = isoAdd(last0, 1);
  while (dateOf(mon).getDay() !== 1) mon = isoAdd(mon, 1);       // the Monday after data.js's last week
  const first = cal.first || mon;
  if (first <= last0) problems.push('Build Calendar: the first school day, ' + first +
    ', is already in the planner, which runs to ' + last0 + ' - set it to a day after that');
  else if (cal.last < first) problems.push('Build Calendar: the last day to build is before the first school day');
  else if (first > mon && !cal.cycle) problems.push('Build Calendar: Its cycle day is needed when the first school day is after ' + mon);
  if (problems.length) return {weeks: [], note: ''};
  let cycle = cal.cycle || lastCycle % 7 + 1, gap = 0;
  const ex = {};
  for (const e of cal.exceptions || []) (ex[e.iso] = ex[e.iso] || []).push(e);
  const weeks = [];
  for (; mon <= cal.last; mon = isoAdd(mon, 7)) {
    const days = [];
    for (let i = 0; i < 5; i++) {
      const iso = isoAdd(mon, i), t = dateOf(iso);
      const d = WEEKDAY[t.getDay()] + ' ' + MONTHS[t.getMonth()].charAt(0) + MONTHS[t.getMonth()].slice(1).toLowerCase() + ' ' + t.getDate();
      const es = ex[iso] || [], off = es.find(e => e.kind === 'off');
      const note = es.filter(e => e.kind !== 'off').map(e => e.label || (e.kind === 'half' ? '½ Day' : ''))
        .filter(Boolean).join(' · ');
      const why = iso < first || iso > cal.last ? 'Not in the Build Calendar' : off ? (off.label || 'No school') : '';
      if (iso < first) gap++;
      const rot = why ? [] : rotation(cycle);
      days.push({d, iso, cycle: why ? null : cycle, off: why, note,
        blocks: rot.concat(rot.length ? [rot[4]] : []).map((per, bi) => ({
          block: B[bi][0], t0: B[bi][1], t1: B[bi][2], asp: !!B[bi][3],
          period: per, course: courseFor(courses, per, iso), cw: null, hw: null})),
        noteLines: asLines(note), offLines: asLines(why)});
      if (!why) cycle = cycle % 7 + 1;
    }
    /* A week the calendar closes altogether - a vacation - is left out, as
       data.js leaves out the week after Christmas. */
    if (days.every(x => x.off && x.off !== 'Not in the Build Calendar')) continue;
    const fri = isoAdd(mon, 4), a = dateOf(mon), z = dateOf(fri);
    weeks.push({label: MONTHS[a.getMonth()] + ' ' + a.getDate() + ' – ' + MONTHS[z.getMonth()] + ' ' +
                       z.getDate() + ', ' + z.getFullYear(), mon, days});
  }
  return {weeks, note: gap ? gap + ' school day(s) before the Build Calendar’s first are blank' : ''};
}

/** True when the weeks changed: their records then need a full pull. */
function applyReference(ref) {
  const mark = stamp(ref);
  if (mark === refApplied) { refNote = refAppliedNote; return false; }
  if (typeof editingKey === 'function' && editingKey()) return false;    // never under an open cell
  const problems = (ref.problems || []).slice();
  const built = problems.length ? null : referenceWeeks(ref, problems);
  if (problems.length) { refNote = 'Courses / Build Calendar not used — ' + problems.join('; '); return false; }
  WEEKS.length = BASE_WEEKS;
  /* data.js's own days: which periods meet stays data.js's; only a course's
     name, section and colours come from the tab, where it has a row. */
  WEEKS.forEach((w, wi) => w.days.forEach((d, di) => d.blocks.forEach((b, bi) => {
    const was = BASE_COURSES[wi][di][bi];
    b.course = was ? (courseFor(ref.courses || [], b.period, d.iso) || was) : null;
  })));
  built.weeks.forEach(w => WEEKS.push(w));
  DAYS.length = 0;
  WEEKS.forEach((w, wIdx) => w.days.forEach((d, dIdx) => DAYS.push({d, w: wIdx, i: dIdx})));
  const m = new Map();
  for (const w of WEEKS) for (const d of w.days) for (const b of d.blocks) if (b.course) m.set(b.period, b.course);
  ALL.length = 0;
  [...m.keys()].sort((a, z) => a - z).forEach(p => ALL.push([p, m.get(p)]));
  refApplied = mark;
  refNote = refAppliedNote = built.note;
  return true;
}

async function pullReference() {
  const d = await call('reference', {});
  refCache = {courses: d.courses || [], calendar: d.calendar || null, problems: d.problems || []};
  saveSync();
  if (applyReference(refCache)) lastPull = '';     // new days: their records come with a full pull
}

/* ---------- the docs app's names, read-only (Shared-Contracts §9.4) ---------- */

let docsNote = '';            // why they are missing, when they are
async function pullDocs() {
  const d = await call('docs', {});
  docsByFile = d.files || {};
  docsNote = d.note || '';            // read, but something about it is worth saying
  saveSync();
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

/* What failed, in words. "Offline" only when the network did not answer: a bad
   token, a busy server or a stale deployment used to say "Offline" too, and a
   bad token at start-up read "Offline - no pending", as if nothing were wrong. */
function failNote(err) {
  const n = Object.keys(queue).length, left = n ? ' \u2014 ' + n + ' pending' : '';
  const m = String((err && err.message) || err || 'no reason given');
  const net = (err instanceof TypeError && /fetch|network|load failed/i.test(m)) ||
              (typeof navigator !== 'undefined' && navigator.onLine === false);
  if (net) return 'Offline' + left;
  if (/bad token/i.test(m)) return 'Token refused \u2014 Shift-click Sync to reconnect' + left;
  if (/not connected/i.test(m)) return 'Not connected' + left;
  if (/busy/i.test(m)) return 'Server busy, trying again' + left;
  return 'Sync failed: ' + m + (srvVersion ? ' (endpoint ' + srvVersion + ')' : '') + left;
}

function setNote(t) {
  const el = document.getElementById('sync');
  if (!el) return;
  if (storeDead && /pending/.test(t)) t += ' \u2014 not kept: this browser refused to store them';
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
    /* First: the records of any new days can only land once the days exist. */
    try { await pullReference(); }
    catch (err) {
      refNote = 'Courses / Build Calendar unavailable' + (srvVersion ? ' (endpoint ' + srvVersion + ')' : '') +
                ': ' + err.message;
    }
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
    // the last copy stays on screen: a stale name beats the file's old one
    try { docsNote = ''; await pullDocs(); }
    catch (err) {
      docsNote = 'Docs names unavailable' + (srvVersion ? ' (endpoint ' + srvVersion + ')' : '') +
                 ': ' + err.message;
      console.warn(docsNote);
    }
    render();
    setNote(Object.keys(queue).length ? Object.keys(queue).length + ' pending' : 'Up to date');
  } catch (err) {
    setNote(failNote(err));
    clearTimeout(retryTimer);
    retryTimer = later(startSync, RETRY_MS);
  }
}

function wireSync() {
  loadSync();
  // the weeks read last time, so they are there before - or without - a connection
  if (refCache && applyReference(refCache)) { centreOnToday(); render(); }
  const btn = document.getElementById('sync');
  if (btn) btn.onclick = e => { if (e.shiftKey || !cfg.url) connect(); else startSync(); };
  const pub = document.getElementById('publish');
  if (pub) { pub.onclick = () => publishNow(); setPub(''); }
  window.addEventListener('online', () => startSync());
  // an open tab holding edits is not an abandoned one
  const beat = setInterval(() => { if (Object.keys(queue).length) saveSync(); }, 60000);
  if (beat && typeof beat.unref === 'function') beat.unref();
  setNote(cfg.url ? 'Connecting\u2026' : 'Not connected');
  startSync();
}
