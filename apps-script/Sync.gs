/**
 * Lesson planner — sync endpoint.
 *
 * Stores plan records and serves them to the app. Follows the same shape as the
 * homework app: a token in Script Properties, JSON in and JSON out, a script
 * lock around every write, and errors returned rather than thrown.
 *
 * Run setup() once, then Deploy ▸ New deployment ▸ Web app,
 * executing as me, access "Anyone".
 *
 * One row per record on the _Records tab:
 *   A key        date|period|field   e.g. 2026-09-02|1|cw
 *   B updatedAt  ISO, assigned by the server, never by the client
 *   C device     last writer, for working out which machine did what
 *   D json       the lines array
 *
 * The app renders these. Nothing here formats anything for a human to read,
 * which is why this file is short and Publish.gs was not.
 */

/* Bumped whenever this file changes, and reported by ?check=1. Saving in the
   editor does not change what /exec serves — only deploying does — so there
   has to be a way to see which code is actually live. */
var VERSION = 'v50 2026-10-08';

var REC_TAB = '_Records';
var MAX_ROWS = 20000;

/* A copy of every record goes to Drive at most once a week, after a save that
   worked. Eight copies is about two months back. */
var BACKUP_DIR = 'Planner backups', KEEP_BACKUPS = 8, BACKUP_EVERY = 7 * 86400000;

function setup() {
  var p = PropertiesService.getScriptProperties();
  p.setProperty('SHEET_ID', SpreadsheetApp.getActiveSpreadsheet().getId());
  if (!p.getProperty('TOKEN')) p.setProperty('TOKEN', Utilities.getUuid());
  recTab();
  Logger.log('TOKEN: ' + p.getProperty('TOKEN'));
  Logger.log('SHEET_ID: ' + p.getProperty('SHEET_ID'));
  say(
    'Sync is set up.\n\nDeploy \u25b8 New deployment \u25b8 Web app, then copy the ' +
    '/exec URL.\n\nToken:\n' + p.getProperty('TOKEN'));
}

/* ---------- endpoint ---------- */

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var want = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!want || req.token !== want) return out({ok: false, error: 'bad token'});
    if (req.action === 'ping') return out({ok: true, now: nowIso()});
    if (req.action === 'pull') return out(pull(req));
    if (req.action === 'push') {
      var done = push(req);
      if (done.ok) backupIfDue();          // after the lock, and it never throws
      return out(done);
    }
    if (req.action === 'title') return out(title(req));
    if (req.action === 'docs') return out(docNames());
    if (req.action === 'reference') return out(reference());
    if (req.action === 'absences') return out(absences());
    if (req.action === 'calendar') return out(putCalendar(req));
    if (req.action === 'publish') return out(publish());
    return out({ok: false, error: 'unknown action: ' + req.action});
  } catch (err) {
    // never throw: a thrown error returns an HTML page the app cannot parse.
    // The message stays in the log — a malformed body reaches here before the
    // token is checked, so this is not a door only I can knock on.
    console.error('doPost failed: ' + err);
    return out({ok: false, error: 'That did not work \u2014 check the endpoint log.'});
  }
}

/**
 * The student feed. No token: this is what students read, so it must be
 * reachable without one — which is exactly why the redaction happens here and
 * not in the page. Nothing teacher-only is ever in this reply.
 *
 * The class goes in as ?class=p1. Do not use ?c= — such a request never
 * arrives, and Drive answers it with an error page of its own.
 */
function doGet(e) {
  var T0 = Date.now();
  try {
    var q = (e && e.parameter) || {};
    /* The diagnostics name the workbook and count the records. Harmless to me,
       but it is information about a system some of my students could poke at,
       and it costs nothing to require the token for it. Publishing does not. */
    /* Which code is actually deployed? No token, because needing one to answer
       that has now cost hours twice: the menu runs the SAVED script while the
       /exec URL runs the DEPLOYED one, and when they differ nothing else you
       check makes sense. A version string gives an outsider nothing. */
    if (q.ping) return out({ok: true, version: VERSION});

    if (q.check || q.echo) {
      var want = PropertiesService.getScriptProperties().getProperty('TOKEN');
      if (!want) return out({ok: false, error: 'no token is set — run setup'});
      if (!q.token) return out({ok: false, version: VERSION,
                                error: 'add &token=… — see Planner sync > Show token'});
      if (q.token !== want) {
        /* The length spots a truncated paste. Nothing about the token's own
           characters: this door is open, and "it starts correctly" let anyone
           check a guess four characters at a time. */
        return out({ok: false, version: VERSION,
          error: 'that token does not match (sent ' + q.token.length +
                 ' characters; a token is ' + want.length + ')'});
      }
      return out(q.echo ? {ok: true, version: VERSION, sawParams: q} : selfCheck());
    }
                                                     // before the class check, so
    /* NOT 'c': a query with c= never reaches this script at all — no execution
       is logged and Drive answers with its own error page. Something in
       Google's URL handling takes that name. 'class' is left alone. */
    var tag = String(q['class'] || '').toUpperCase();
    if (!/^P[1-7]$/.test(tag)) {
      // never "?c=" — Drive intercepts that parameter and the request never
      // arrives. This message said c= for weeks after the code stopped using it.
      /* A POST that lost its body to a redirect lands here with nothing at
         all. Say so, so the app can tell that apart from a student mistyping
         the address and simply send it again. */
      if (!Object.keys(q).length) {
        return out({ok: false, version: VERSION,
                    error: 'this endpoint expects a POST \u2014 the request arrived ' +
                           'with no body, which means a redirect converted it'});
      }
      return out({ok: false, version: VERSION,
                  error: 'which class? add ?class=p1 (p1 p2 p4 p5 p7)'});
    }
    /* A student asking for the page gets the copy publishing left ready: no
       spreadsheet opened, no payload parsed, no markup built. The JSON takes
       the long way. Colleague links (&k=) were removed in v47; a k is ignored. */
    if (q.page) {
      /* &time=1 adds a readout at the foot of the page. Students never pass it,
         so they never see it. Appended at serve time rather than built into the
         page, or the ready-made copy would carry the moment it was built
         instead of the moment it was asked for. */
      var rep = {};
      var served = studentPage(tag, rep);
      if (q.time) served.append(timingHtml(Date.now() - T0, rep.hit));
      return served;
    }

    /* Without &page=1, the JSON. The page above is built from this same
       redacted payload, so a held link cannot leak through one and not the
       other. */
    return out(readPublished(tag));
  } catch (err) {
    /* Never hand the raw exception to whoever asked. Apps Script messages name
       the document they failed on, and this door is open to students. The
       detail goes to the log, where only I can read it. */
    console.error('doGet failed: ' + err);
    var q2 = (e && e.parameter) || {};
    var msg = {ok: false, error: 'The agenda is not available right now.'};
    return q2.page ? page(msg) : out(msg);
  }
}

/* Every reply carries the version that produced it. A machine pointed at an
   old deployment is otherwise invisible: its answers look ordinary, just wrong,
   and the only clue is wording that changed versions ago. The app puts this in
   any message it shows me, so a stale endpoint names itself. */
function out(o) {
  if (o && typeof o === 'object' && o.version === undefined) o.version = VERSION;
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function nowIso() { return new Date().toISOString(); }

/** ?check=1 — what the endpoint can see, for when something is not working. */
function selfCheck() {
  var p = PropertiesService.getScriptProperties();
  var o = {ok: true, version: VERSION, sheetId: p.getProperty('SHEET_ID') ? 'stored' : 'MISSING',
           token: p.getProperty('TOKEN') ? 'stored' : 'MISSING'};
  try {
    o.workbook = book().getName();
    var cal = tabIfAny(CAL_TAB), pub = tabIfAny(PUB_TAB), rec = tabIfAny(REC_TAB);
    o.calendarTab = cal ? cal.getLastRow() + ' row(s)' : 'not there yet';
    o.publishedTab = pub ? pub.getLastRow() + ' row(s)' : 'not there yet';
    o.recordsTab = rec ? (rec.getLastRow() - 1) + ' record(s)' : 'not there yet';
    o.lastPublish = p.getProperty('lastPublish') || 'never';
  } catch (err) {
    o.ok = false;
    o.error = String(err);
  }
  return o;
}

/* ---------- what students may see ---------- */

/**
 * Strip a cell down to what is publishable. A held link keeps its words and
 * loses its address entirely; a private line and a (( )) run disappear.
 *
 * Pure, so the tests can run it directly rather than trusting a copy.
 */
function redactLines(lines, names) {
  if (!lines || !lines.length) return null;
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (!l) { out.push(null); continue; }          // a blank line survives
    if (l.private) continue;                       // '//' whole line
    var spans = [];
    for (var j = 0; j < l.spans.length; j++) {
      var sp = l.spans[j];
      if (sp.priv) continue;                       // '(( ))' run
      if (!sp.t) continue;
      // a link's label: the docs app's name for students, else cut at the version
      if (sp.url) sp = {t: shownLabel(sp.t, sp.url, names, true), url: sp.url, rel: sp.rel};
      // held: the words, marked so the page can show something is coming, and
      // no address anywhere — the flag says "a link exists", never which one
      spans.push(sp.url
        ? (sp.rel ? {t: sp.t, url: sp.url} : {t: sp.t, held: 1})
        : {t: sp.t});
    }
    var any = false;
    for (var k = 0; k < spans.length; k++) if (String(spans[k].t).trim()) any = true;
    if (any) out.push({bullet: !!l.bullet, spans: spans});
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  while (out.length && out[0] === null) out.shift();
  return out.length ? out : null;
}

/**
 * Only ever applied to a label that came from the sheet, never to one I typed.
 * The seeded ones carry PD times and staff detail written for me; anything I
 * put in the app's own field, I can see, and I know students read it — so it
 * goes out exactly as written.
 */
function studentReason(raw) {
  if (!raw) return 'No school';
  var t = String(raw).split(/\s+[\u2014\-+]\s+|\s+\+\s+/)[0].trim();
  if (/staff/i.test(t)) return 'No school';
  return t || 'No school';
}

/** the plain text of a note record, used as an off-day reason */
function noteTextOf(lines) {
  if (!lines || !lines.length) return '';
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (!l || l.private) continue;
    var t = '';
    for (var j = 0; j < l.spans.length; j++) if (!l.spans[j].priv) t += l.spans[j].t;
    if (t.trim()) out.push(t.trim());
  }
  return out.join(' ');
}

/**
 * The last date students may see: the Friday of the current week, where the
 * week turns over at 5am on Monday rather than at midnight. Sunday evening
 * still shows the week just gone; Monday breakfast shows the new one whole.
 */
function horizonISO(now) {
  var d = new Date(now.getTime() - 5 * 3600 * 1000);   // shift the rollover
  var dow = d.getDay();                                // 0 Sun .. 6 Sat
  var back = (dow + 6) % 7;                            // days since Monday
  var mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
  var fri = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 4);
  return iso(fri);
}

function iso(d) {
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* ---------- reading the gradebook, on its own ----------
 *
 * These lived in Publish.gs and are ported here so that file can retire, which
 * was always the plan. Prefixed gb* so nothing collides if it is still around.
 */

var CONFIG_TAB = 'Gradebook', CFG_URL = 'C4', CFG_FIRST = 7, CFG_ROWS = 10;
var LINKS_TAB = 'Student Links';
var CODES = ['AB', 'T', 'TE', 'TX'];

function gbConfig() {
  var sh = book().getSheetByName(CONFIG_TAB);
  if (!sh) return {id: '', map: {}};
  var raw = String(sh.getRange(CFG_URL).getDisplayValue() || '').trim();
  var id = '', m = raw.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) id = m[1];
  else if (/^[a-zA-Z0-9_-]{20,}$/.test(raw)) id = raw;
  var map = {};
  sh.getRange(CFG_FIRST, 2, CFG_ROWS, 3).getDisplayValues().forEach(function (r) {
    var tagM = String(r[0] || '').match(/P\s*([1-7])/i);
    var tabName = String(r[2] || '').trim();
    if (tagM && tabName) map['P' + tagM[1]] = tabName;
  });
  return {id: id, map: map};
}

function gbTabs(gb, map) {
  var out = {};
  Object.keys(map).forEach(function (tag) {
    var sh = gb.getSheetByName(map[tag]);
    if (sh) out[tag] = sh;
  });
  return out;
}

function gbShortName(a, b) {
  a = String(a || '').trim(); b = String(b || '').trim();
  if (a.indexOf(',') >= 0) { var p = a.split(','); a = p[0].trim(); b = p[1] || b; }
  if (!a) return '';
  b = String(b || '').trim();
  return b ? b.charAt(0).toUpperCase() + ' ' + a : a;
}

function gbInspect(sh) {
  var last = sh.getLastRow(), lastc = sh.getLastColumn();
  if (last < 2 || lastc < 2) return {hdr: -1};
  var grid = sh.getRange(1, 1, last, lastc).getDisplayValues();
  var hdr = -1, cols = {};
  for (var r = 0; r < Math.min(grid.length, 12) && hdr < 0; r++) {
    var found = {};
    for (var c = 0; c < lastc; c++) {
      var dm = String(grid[r][c]).match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*$/);
      if (dm) found[c] = {mo: +dm[1], da: +dm[2]};
    }
    if (Object.keys(found).length) { hdr = r; cols = found; }
  }
  return {hdr: hdr, cols: cols, grid: grid};
}

/**
 * The quick links band. Each entry keeps the row it came from, so the order on
 * a student page is the order of the rows on the tab — a link marked ALL and
 * one marked P1 can be interleaved by moving rows, rather than ALL always
 * arriving first.
 */
function gbLinks() {
  var sh = book().getSheetByName(LINKS_TAB);
  var out = {};
  if (!sh) return out;
  var last = sh.getLastRow();
  if (last < 6) return out;
  sh.getRange(6, 2, last - 5, 4).getDisplayValues().forEach(function (row, i) {
    var who = String(row[0] || '').trim().toUpperCase();
    var label = String(row[1] || '').trim();
    var url = String(row[2] || '').trim();
    if (!label || !url || String(row[3] || '').trim().toLowerCase() === 'no') return;
    if (!/^https?:\/\//i.test(url)) return;
    (who ? who.split(/[,;\/]+/) : ['ALL']).forEach(function (t) {
      t = t.trim().toUpperCase();
      if (t) (out[t] = out[t] || []).push({label: label, url: url, n: i});
    });
  });
  return out;
}

/* ---------- absences ---------- */

/**
 * Read-only, straight from the gradebook workbook.
 *
 * A day is reported when the attendance column has ANY mark in it, even if
 * nobody was out — otherwise "everyone was here" and "I haven't taken it yet"
 * arrive as the same nothing, and the planner cannot tell them apart.
 *
 * Nothing here ever writes. The Attend column belongs to pullAbsences().
 */
function absences() {
  var cfg = gbConfig();
  if (!cfg.id) return {ok: false, error: 'no gradebook URL in ' + CFG_URL + ' of the Gradebook tab'};
  if (!Object.keys(cfg.map).length) {
    return {ok: false, error: 'no classes mapped to attendance tabs on the Gradebook tab'};
  }
  var gb = SpreadsheetApp.openById(cfg.id);
  var tabs = gbTabs(gb, cfg.map), out = {}, seen = 0;

  Object.keys(tabs).forEach(function (tag) {
    var info = gbInspect(tabs[tag]);
    if (info.hdr < 0) return;
    var grid = info.grid, days = {};
    Object.keys(info.cols).forEach(function (c) {
      var key = info.cols[c].mo + '/' + info.cols[c].da;
      var marked = 0, byCode = {};
      for (var rr = info.hdr + 1; rr < grid.length; rr++) {
        var nm = gbShortName(grid[rr][0], grid[rr][1]);
        if (!nm) continue;
        var code = String(grid[rr][c] || '').trim().toUpperCase();
        if (!code) continue;
        marked++;
        if (CODES.indexOf(code) < 0) continue;
        (byCode[code] = byCode[code] || []).push(nm);
      }
      if (marked) { days[key] = byCode; seen++; }
    });
    out[tag] = days;
  });
  if (!seen) return {ok: false, error: 'the mapped tabs have no dated attendance columns'};
  return {ok: true, now: nowIso(), byTag: out};
}

/* ---------- calendar, handed over by the app ---------- */

var CAL_TAB = '_Calendar', PUB_TAB = '_Published';

/* Opened once per request: every openById is a round trip, and a publish
   used to make five (records, calendar, published, links, courses). Apps
   Script starts each request with fresh globals, so this never outlives the
   request it was opened for. */
var BOOK = null;
function book() {
  if (BOOK) return BOOK;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('run setup() first — no SHEET_ID stored');
  return (BOOK = SpreadsheetApp.openById(id));
}

function tab(name) {
  var ss = book();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.hideSheet(); }
  return sh;
}

/** Read-only: never creates anything. doGet must not write. */
function tabIfAny(name) {
  return book().getSheetByName(name);
}

/**
 * The endpoint knows records but not the shape of the year — which dates are
 * school days, which period is which class. The app has that in data.js and
 * hands it over. One row per week keeps every cell well under the size limit.
 */
function putCalendar(req) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return {ok: false, error: 'busy, try again'};
  try {
    var sh = tab(CAL_TAB);
    sh.clear();
    var rows = [['courses', JSON.stringify(req.courses || {})]];
    (req.weeks || []).forEach(function (w) { rows.push([w.mon, JSON.stringify(w)]); });
    sh.getRange(1, 1, rows.length, 2).setValues(rows);
    SpreadsheetApp.flush();
    return {ok: true, weeks: rows.length - 1};
  } finally {
    lock.releaseLock();
  }
}

function getCalendar() {
  var sh = tabIfAny(CAL_TAB);
  if (!sh) return null;
  var last = sh.getLastRow();
  if (!last) return null;
  var vals = sh.getRange(1, 1, last, 2).getValues();
  var out = {courses: {}, weeks: []};
  for (var i = 0; i < vals.length; i++) {
    var k = String(vals[i][0] || '');
    if (!k) continue;
    var v = parse(String(vals[i][1] || ''));
    if (!v) continue;
    if (k === 'courses') out.courses = v; else out.weeks.push(v);
  }
  out.weeks.sort(function (a, b) { return a.mon < b.mon ? -1 : 1; });
  return out;
}

/* ---------- publishing ---------- */

/**
 * Build one payload per class from the records, redacted, up to the horizon.
 * Weeks newest first; days inside a week in order. Written per class per week,
 * so no single cell grows past what a cell can hold.
 */
function publish() {
  var r = publishLocked();
  /* Then build the pages again straight away. This runs unattended on the
     fifteen-minute trigger, so the work lands here rather than on the first
     student to open a page. It runs after the lock is let go: five pages take
     seconds, and a save arriving meanwhile used to wait 20 s behind them and
     be refused. A page built from a publish that has since been overtaken is
     thrown away by that publish's own cache clear. */
  if (r.ok) {
    try { warmPages(); } catch (err) { console.error('could not warm the pages: ' + err); }
  }
  return r;
}

function publishLocked() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return {ok: false, error: 'busy, try again'};
  try {
    var cal = getCalendar();
    if (!cal || !cal.weeks.length) {
      return {ok: false, error: 'no calendar yet — open the planner app once to send it'};
    }
    var recs = readAll(recTab());
    var limit = horizonISO(new Date());
    var stamp = nowIso();
    var rows = [], counts = {};
    /* The docs app's names, read once. Unreadable, publishing goes on with
       the stored names, and says why in Check health. */
    var dn = docNames(), names = dn.ok ? dn.files : {};
    PropertiesService.getScriptProperties().setProperty('DOCS_STATE',
      (dn.ok ? dn.count + ' files from 20' + dn.year + (dn.note ? '; ' + dn.note : '') : 'NOT READ: ' + dn.error) + ', at ' + stamp);

    cal.weeks.forEach(function (w) {
      var days = (w.days || []).filter(function (d) { return d.iso <= limit; });
      if (!days.length) return;
      Object.keys(cal.courses).forEach(function (per) {
        var c = cal.courses[per];
        var out = [];
        days.forEach(function (d) {
          // A day I cancelled after the fact — a snow day — carries an off
          // record even though the calendar had school. Students see the reason
          // and nothing else; the work stays in the records for me to move.
          var offRec = recs[d.iso + '|day|off'];
          var reason = offRec ? noteTextOf(parse(offRec.json)) : '';
          if (!d.cycle || reason) {
            out.push({d: d.d, iso: d.iso,
                      off: reason || studentReason(d.off)});   // typed: verbatim
            return;
          }
          var meets = [];
          (d.blocks || []).forEach(function (b) {
            if (String(b.period) !== String(per)) return;
            var key = d.iso + '|P' + per + (b.asp ? 'a' : '') + '|';
            var cw = recs[key + 'cw'] ? redactLines(parse(recs[key + 'cw'].json), names) : null;
            var hw = recs[key + 'hw'] ? redactLines(parse(recs[key + 'hw'].json), names) : null;
            if (cw || hw) meets.push({block: b.block, cw: cw, hw: hw});
          });
          /* An empty list is ambiguous: on a seven-day rotation this class does
             not meet two days in five, and that reads quite differently from a
             day it meets but nothing is written yet. Say which. */
          var sits = (d.blocks || []).some(function (b) {
            return String(b.period) === String(per);
          });
          out.push(sits ? {d: d.d, iso: d.iso, meets: meets}
                        : {d: d.d, iso: d.iso, meets: [], nomeet: 1});
        });
        var real = out.filter(function (x) { return x.meets && x.meets.length; }).length;
        if (!real) return;                           // nothing published for this class
        counts[c.tag] = (counts[c.tag] || 0) + real;
        rows.push([c.tag, w.mon, JSON.stringify({label: w.label, mon: w.mon, days: out}), stamp]);
      });
    });

    // the quick links bar, straight off the Student Links tab that Publish.gs
    // already maintains — one row, read back out when a student loads a page
    var links = {};
    try { links = gbLinks(); } catch (err) { links = {}; }
    rows.push(['LINKS', '', JSON.stringify(links), stamp]);

    /* Write over the old rows, then trim what is left below. Clearing first
       left a window in which a student loading the page got nothing at all —
       small, but it is the one moment when failure is visible to them. */
    var sh = tab(PUB_TAB);
    var had = sh.getLastRow();
    if (rows.length) sh.getRange(1, 1, rows.length, 4).setValues(rows);
    if (had > rows.length) {
      sh.getRange(rows.length + 1, 1, had - rows.length, 4).clearContent();
    }
    PropertiesService.getScriptProperties().setProperty('lastPublish', stamp);
    // what students see has just changed, so the held copies are wrong
    try {
      var keys = [];
      ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'].forEach(function (t) {
        keys.push('pub:' + t); keys.push('html:' + t);
      });
      CacheService.getScriptCache().removeAll(keys);
    } catch (err) { /* the cache expiring on its own is an acceptable fallback */ }
    SpreadsheetApp.flush();
    return {ok: true, now: stamp, through: limit, classes: counts, docs: dn.ok ? dn.count : dn.error};
  } finally {
    lock.releaseLock();
  }
}

/** Everything published for one class, newest week first. */
/* A student request used to open the spreadsheet and read two tabs every time,
   for every student, on every load — and the page appends a cache-buster, so
   nothing was ever reused. The answer only changes when I publish, so hold it
   in the script cache and let publish() throw it away. Opening a spreadsheet
   is most of what a cold request costs. */
function readPublished(tag) {
  var ck = 'pub:' + tag, cache = CacheService.getScriptCache();
  try {
    var hit = cache.get(ck);
    if (hit) return JSON.parse(hit);
  } catch (err) { /* a bad cache entry is not worth failing over */ }
  var built = buildPublished(tag);
  try {
    var s = JSON.stringify(built);
    if (s.length < 95000) cache.put(ck, s, 21600);      // 6h, or until I publish
  } catch (err) { /* too big to cache: serve it anyway */ }
  return built;
}

function buildPublished(tag) {
  var cal = getCalendar() || {courses: {}};
  var info = null;
  Object.keys(cal.courses).forEach(function (p) {
    if (cal.courses[p].tag === tag) info = cal.courses[p];
  });
  var sh = tabIfAny(PUB_TAB);
  var last = sh ? sh.getLastRow() : 0, weeks = [], stamp = '', links = [];
  if (last) {
    var vals = sh.getRange(1, 1, last, 4).getValues();
    for (var i = 0; i < vals.length; i++) {
      var row = String(vals[i][0]);
      if (row === 'LINKS') {
        var all = parse(String(vals[i][2] || '')) || {};
        links = (all['ALL'] || []).concat(all[tag] || [])
          .sort(function (a, b) { return (a.n || 0) - (b.n || 0); })
          .map(function (l) { return {label: l.label, url: l.url}; });
        continue;
      }
      if (row !== tag) continue;
      var w = parse(String(vals[i][2] || ''));
      if (w) weeks.push(w);
      stamp = String(vals[i][3] || stamp);
    }
  }
  weeks.sort(function (a, b) { return a.mon < b.mon ? 1 : -1; });   // newest first
  if (!weeks.length) {
    return {ok: true, tag: tag, course: info, updated: '', links: links, weeks: [],
            note: sh ? 'nothing published for ' + tag + ' yet'
                     : 'nothing has been published yet — run Publish to students now'};
  }
  return {ok: true, tag: tag, course: info, updated: stamp, links: links, weeks: weeks};
}

/* ---------- the page, served from here ---------- */

function esc(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* A pasted Drive link labels itself with the file's whole name:
     01.C.5 - UAPM: Quantitative Acceleration Problems v.26.1 (amta).pdf
   I see it without the file type; students see it cut at the version:
     01.C.5 - UAPM: Quantitative Acceleration Problems v.26.1 (amta)
     01.C.5 - UAPM: Quantitative Acceleration Problems
   Display only: the stored words are untouched, and an open cell shows them
   whole. The same function is in render.js and Sync.gs; test-linkname.js
   holds the two to one table. The file types are the knob. */
function linkLabel(t, forStudents) {
  var s = String(t == null ? '' : t), cut = s;
  if (forStudents) cut = cut.replace(/\s+v\.\d+(?:\.\d+)*(?=[\s.]|$)[\s\S]*$/i, '');
  cut = cut.replace(/\.(pdf|docx?|pptx?|xlsx?|odt|rtf|txt|csv|png|jpe?g|gif|heic|mp3|m4a|mp4|mov|zip)$/i, '');
  return cut.trim() ? cut : s;          // never trim a label down to nothing
}

/* A link to a file the docs app keeps shows the docs app's current name for
   it, so a renumber reaches the planner with nothing retyped. Only a label
   that came from a file's name follows, one that still starts with a number
   ("01.C.5 - ..."); one typed over by hand stays as typed. names: Drive id ->
   {s: students', f: mine}, from Sync.gs docNames(). The same function is in
   render.js and Sync.gs; test-docnames.js holds the two to one table. */
function shownLabel(t, url, names, forStudents) {
  var m = String(url || '').match(/\/d\/([a-zA-Z0-9_-]{20,})|[?&]id=([a-zA-Z0-9_-]{20,})/);
  var d = m && names ? names[m[1] || m[2]] : null;
  if (d && /^[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)+ - /.test(String(t))) return forStudents ? d.s : d.f;
  return linkLabel(t, forStudents);
}

function spanHtml(sp) {
  if (sp.priv) return '';                            // same reasoning as above
  // redactLines() already cut a student's labels; cutting again changes nothing
  var t = esc(sp.url || sp.held ? linkLabel(sp.t, true) : sp.t);
  if (sp.url && sp.rel === false) return t;          // a held link is words only
  if (sp.url) return '<a href="' + esc(sp.url) + '" target="_blank" rel="noopener">' + t + '</a>';
  if (sp.held) return '<span class="held">' + t + '</span>';
  return t;
}

function linesHtml(ls) {
  if (!ls || !ls.length) return '';
  var out = '';
  for (var i = 0; i < ls.length; i++) {
    var l = ls[i];
    if (!l) { out += '<div class="gap"></div>'; continue; }
    // belt and braces: redactLines() already removed these, but a renderer
    // that trusts its input will happily print whatever a bug hands it
    if (l.private) continue;                       // the page, again
    var cls = 'ln' + (l.bullet ? ' b' : '');
    var body = '';
    for (var j = 0; j < l.spans.length; j++) body += spanHtml(l.spans[j]);
    out += '<p class="' + cls + '">' + body + '</p>';
  }
  return out;
}

function fieldHtml(label, ls) {
  var body = linesHtml(ls);
  return body ? '<div class="fld"><h4>' + label + '</h4>' + body + '</div>' : '';
}

/** the same shape the GitHub page draws, built here instead */
/** The page as its three parts, so it can be wrapped now or kept for later. */
function pageParts(data) {
  /* A failure says nothing about why. The legitimate ones — no calendar, no
     such class — tell a student nothing useful, and an unexpected one could
     name my spreadsheet. The reason is in the log either way. */
  if (!data.ok) {
    return {title: 'Agenda', accent: '',
            body: '<p class="msg">This agenda is not available right now.</p>'};
  }

  var c = data.course || {};
  var head = (c.tag ? c.tag + ' \u00b7 ' : '') + (c.name || 'Class agenda');
  var stamp = data.updated
    ? 'Updated ' + Utilities.formatDate(new Date(data.updated),
        Session.getScriptTimeZone(), 'EEE, MMM d, h:mm a')
    : '';
  var body = '';
  if (data.links && data.links.length) {
    body += '<nav class="bar">';
    for (var i = 0; i < data.links.length; i++) {
      body += '<a href="' + esc(data.links[i].url) + '" target="_blank" rel="noopener">' +
              esc(data.links[i].label) + '</a>';
    }
    body += '</nav>';
  }

  var any = false;
  for (var w = 0; w < data.weeks.length; w++) {
    var wk = data.weeks[w], rows = '', stripe = 0;
    for (var d = 0; d < wk.days.length; d++) {
      var day = wk.days[d], z = stripe ? ' alt' : '';
      if (day.off) {
        rows += '<div class="row off' + z + '"><div class="when">' + esc(day.d) + '</div>' +
                '<div class="blk"></div><div class="note">' + esc(day.off) + '</div></div>';
        stripe = 1 - stripe;
        continue;
      }
      if (day.nomeet) {
        rows += '<div class="row off' + z + '"><div class="when">' + esc(day.d) + '</div>' +
                '<div class="blk"></div><div class="note nomeet">No class today</div></div>';
        stripe = 1 - stripe;
        continue;
      }
      var meets = [];
      for (var m = 0; m < (day.meets || []).length; m++) {
        if (day.meets[m].cw || day.meets[m].hw) meets.push(day.meets[m]);
      }
      if (!meets.length) continue;
      for (var n = 0; n < meets.length; n++) {
        rows += '<div class="row' + z + '">' +
          '<div class="when">' + (n ? '' : esc(day.d)) + '</div>' +
          '<div class="blk">' + esc(meets[n].block || '') + '</div>' +
          '<div class="col">' + fieldHtml('Class work', meets[n].cw) + '</div>' +
          '<div class="col">' + fieldHtml('Homework', meets[n].hw) + '</div>' +
          '</div>';
      }
      stripe = 1 - stripe;
    }
    if (!rows) continue;
    any = true;
    body += '<section class="week"><h2>' +
      '<span class="when2"><span class="dates">' + esc(wk.label) + '</span>' +
      (stamp ? '<span class="upd">' + esc(stamp) + '</span>' : '') + '</span>' +
      '<span class="cls">' + esc(head) + '</span></h2>' + rows + '</section>';
  }
  if (!any) body += '<p class="msg">Nothing posted yet.</p>';
  return {title: head + ' Agenda', body: body, accent: c.ink};
}

function page(data) {
  var pp = pageParts(data);
  return htmlOut(pageDoc(pp.body, pp.accent), pp.title);
}

function html(body, title, accent) {
  return htmlOut(pageDoc(body, accent), title);
}

/** the finished document, as a string, so it can be built once and kept */
function pageDoc(body, accent) {
  var css = PAGE_CSS.replace('#1B3A5C;/*accent*/', (accent || '#1B3A5C') + ';');
  /* A Chromebook tab sits open for days. The GitHub page rechecks when a
     student comes back to it; without this the served one would quietly show
     Monday's plan on Thursday. Reload only on returning to a stale tab — no
     polling, and nothing happens while it is being read. */
  var fresh =
    '<script>(function(){var t=Date.now();' +
    'document.addEventListener("visibilitychange",function(){' +
    'if(!document.hidden&&Date.now()-t>3e5)location.reload();});})();<\/script>';
  return '<!doctype html><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>' + css + '</style><main>' + body + '</main>' + fresh;
}

function htmlOut(doc, title) {
  var out = HtmlService.createHtmlOutput(doc);
  out.setTitle(title);
  out.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);   // Schoology, Sites
  return out;
}

/**
 * The timing readout, shown only when the address carries &time=1. Students
 * never pass it, so they never see it.
 *
 * Two numbers, answering different questions. "Server work" is the time this
 * script spent; it is the same on any network, so if it is ever more than a few
 * milliseconds the fault is mine. "Page ready after" is the browser's own
 * measure, and that is the one that moves between a home connection and the
 * school's.
 *
 * The browser's clock starts when THIS document began loading, so it leaves out
 * the first hop to /exec and the redirect that follows. It undercounts a
 * little, equally in both places — fine for comparing the two, not a figure to
 * quote on its own.
 */
function timingHtml(ms, hit) {
  return '<div style="position:fixed;left:0;right:0;bottom:0;z-index:99;' +
    'background:#16202B;color:#E8EDF1;font:12px/1.6 system-ui,-apple-system,sans-serif;' +
    'padding:7px 14px;display:flex;gap:20px;flex-wrap:wrap">' +
    '<span>server work <b>' + ms + ' ms</b></span>' +
    '<span>' + (hit ? 'ready-made copy' : 'built for this request') + '</span>' +
    '<span id="__tb">page ready after \u2026</span></div>' +
    '<script>(function(){var b=document.getElementById("__tb");' +
    'var show=function(){b.innerHTML="page ready after <b>"+' +
    'Math.round(performance.now())+" ms</b>";};' +
    'if(document.readyState==="complete"){show();}' +
    'else{window.addEventListener("load",show);}})();<\/script>';
}

/**
 * The student page, ready-made.
 *
 * Apps Script has to wake before it does anything, and that is the floor. What
 * it does NOT have to do is open the spreadsheet, parse a payload and build the
 * markup while a student waits. Publishing does all of that and leaves the
 * finished page here, so a request costs one cache read.
 *
 * The title travels on the first line — cheaper than wrapping the whole
 * document in JSON just to carry it.
 */
function studentPage(tag, report) {
  var ck = 'html:' + tag, cache = CacheService.getScriptCache();
  try {
    var hit = cache.get(ck);
    var nl = hit ? hit.indexOf('\n') : -1;
    /* A miss, not something to serve: the entry has to carry a title line and a
       whole document. Every page we build ends with the reload script, so a
       short or half-written one fails the tail check and gets rebuilt. */
    if (nl > 0 && hit.indexOf('<!doctype html>', nl) === nl + 1 &&
        hit.slice(-9) === '</script>') {
      if (report) report.hit = true;
      return htmlOut(hit.slice(nl + 1), hit.slice(0, nl));
    }
  } catch (err) { /* a bad entry is not worth failing a student's page over */ }
  if (report) report.hit = false;
  return buildStudentPage(tag);
}

function buildStudentPage(tag) {
  var pp = pageParts(readPublished(tag));
  var doc = pageDoc(pp.body, pp.accent);
  try {
    var blob = pp.title + '\n' + doc;
    if (blob.length < 95000) CacheService.getScriptCache().put('html:' + tag, blob, 21600);
  } catch (err) { /* too big to keep: serve it anyway */ }
  return htmlOut(doc, pp.title);
}

/** Build every class's page now, so no student is the one who pays for it. */
function warmPages() {
  var cal = getCalendar() || {courses: {}};
  Object.keys(cal.courses).forEach(function (p) {
    try { buildStudentPage(cal.courses[p].tag); }
    catch (err) { console.error('could not warm ' + cal.courses[p].tag + ': ' + err); }
  });
}

/* The system font stack, not Source Sans 3: Apps Script cannot serve a .woff2,
   and 60KB of base64 on every Chromebook load is a poor trade for a typeface.
   Sizes and colours match the GitHub page. */
var PAGE_CSS =
'*{box-sizing:border-box}' +
':root{--accent:#1B3A5C;/*accent*/--link:#0B4C81;--ink:#16202B;--slate:#5F6E7B;' +
'--mute:#8B97A2;--hair:#DDE3E8;--band:#E9EEF2}' +
'body{margin:0;background:#fff;color:var(--ink);-webkit-text-size-adjust:100%;' +
'font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
'main{max-width:78rem;margin:0 auto;padding:8px 14px 48px}' +
'a{color:var(--link);text-decoration:underline;text-underline-offset:2px;' +
'text-decoration-thickness:1.5px;font-weight:600}' +
'.held{font-weight:600;text-decoration:underline dotted;' +
'text-decoration-color:var(--slate);text-underline-offset:2px}' +
'.week>h2{margin:18px 0 0;padding:7px 12px;font-weight:400;background:var(--accent);' +
'color:#fff;border-radius:3px;display:flex;justify-content:space-between;' +
'align-items:center;gap:16px}' +
'.week:first-of-type>h2{margin-top:10px}' +
'.week>h2 .when2{display:flex;flex-direction:column;line-height:1.25}' +
'.week>h2 .dates{font-size:13px;font-weight:600;letter-spacing:.05em}' +
'.week>h2 .upd{font-size:11px;opacity:.7}' +
'.week>h2 .cls{font-size:16px;font-weight:600;white-space:nowrap}' +
'.row{display:grid;grid-template-columns:6.5rem 4.6rem 1fr 1fr;gap:0 14px;' +
'padding:7px 10px;border-bottom:1px solid var(--hair);align-items:start}' +
'.row.alt{background:var(--band)}' +
'.when{font-weight:600;font-size:13.5px}' +
'.blk{color:var(--slate);font-size:12.5px}' +
'.row.off{color:var(--slate)}' +
'.nomeet{color:var(--mute);font-style:italic}' +
'.row.off .note{grid-column:3/-1;margin:0;font-style:italic}' +
'.col+.col{border-left:1px solid var(--hair);padding-left:16px}' +
'.fld{margin:0 0 8px}.fld:last-child{margin-bottom:0}' +
'.fld>h4{margin:0 0 3px;font-size:11px;font-weight:600;letter-spacing:.05em;' +
'text-transform:uppercase;color:var(--slate)}' +
'.ln{margin:0 0 1px;overflow-wrap:anywhere;font-size:13.5px;line-height:1.42}' +
'.ln.b{display:list-item;list-style:disc outside;margin-left:1.1em}' +
'.gap{height:.55em}' +
'.bar{display:flex;flex-wrap:wrap;gap:2px 16px;justify-content:center;' +
'padding:5px 10px;margin:0 0 2px;background:var(--band);border:1px solid var(--hair);' +
'border-radius:4px}.bar a{font-size:13px;font-weight:600}' +
'.msg{color:var(--mute);font-style:italic;padding:18px 2px}' +
/* stacked: the date and the block share a line, then a gap before the plan.
   Must stay in step with the same block in agenda/agenda.css. */
'@media (max-width:52rem){.row{grid-template-columns:auto 1fr;gap:0 .7em;padding:10px 8px}' +
'.when{grid-column:1;font-size:15px}' +
'.blk{grid-column:2;justify-self:start;align-self:baseline}' +
'.row.off .note{grid-column:2;margin:0}' +
'.col{grid-column:1/-1;margin-top:.85em}' +
'.col+.col{border-left:0;padding-left:0;margin-top:12px;' +
'padding-top:11px;border-top:2px solid var(--accent)}' +
'.fld>h4{font-size:12.5px;color:var(--slate)}}';

/* ---------- document titles ---------- */

/**
 * The name of a Drive file, so a pasted link can label itself. Runs as me, so
 * it only ever sees files I can already open. A file that can't be read comes
 * back as an empty title rather than an error — the app just keeps the address
 * as the label and I can type over it.
 */
function title(req) {
  var id = fileId(req.url || '');
  if (!id) return {ok: true, title: ''};
  try {
    return {ok: true, title: DriveApp.getFileById(id).getName()};
  } catch (err) {
    try {
      return {ok: true, title: DriveApp.getFolderById(id).getName()};
    } catch (err2) {
      return {ok: true, title: ''};
    }
  }
}

/** the id out of any of Google's URL shapes */
function fileId(u) {
  u = String(u || '');
  var m = u.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  m = u.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : '';
}

/* ---------- reference-in: the Courses and Build Calendar tabs ---------- */

/* Read-only, from this workbook. Courses is read by its header row, Build
   Calendar by its labels, so a row added above either moves nothing. A value
   that cannot be read is a problem, named with its row; the app then keeps
   what it had rather than half-applying. */
var REF_COURSES = 'Courses', REF_CAL = 'Build Calendar';
var REF_COLS = ['period', 'symbol', 'course', 'section', 'fill', 'text', 'from', 'until'];

function reference() {
  var problems = [];
  var cs = tabIfAny(REF_COURSES);
  if (!cs) return {ok: false, error: 'the planner workbook has no ' + REF_COURSES + ' tab'};
  var rows = cs.getDataRange().getValues(), h = -1, col = {};
  for (var i = 0; i < rows.length && h < 0; i++) {
    var low = rows[i].map(function (v) { return String(v).trim().toLowerCase(); });
    if (low.indexOf('period') < 0 || low.indexOf('course') < 0) continue;
    h = i;
    low.forEach(function (v, j) { if (v && col[v] === undefined) col[v] = j; });
  }
  if (h < 0) return {ok: false, error: 'the ' + REF_COURSES + ' tab has no header row with Period and Course'};
  var missing = REF_COLS.filter(function (w) { return col[w] === undefined; });
  if (missing.length) return {ok: false, error: 'the ' + REF_COURSES + ' tab has no ' + missing.join(', ') + ' column'};

  var courses = [];
  // the table ends at the first row with no period; notes below it are not rows
  for (i = h + 1; i < rows.length && String(rows[i][col.period]).trim(); i++) {
    var r = rows[i], at = REF_COURSES + ' row ' + (i + 1);
    var get = function (w) { return String(r[col[w]] == null ? '' : r[col[w]]).trim(); };
    var c = {period: Number(get('period')), sym: get('symbol'), name: get('course'), sec: get('section'),
             fill: refHex(get('fill')), ink: refHex(get('text')),
             from: refIso(r[col.from]), until: refIso(r[col.until])};
    if (!/^[1-7]$/.test(get('period'))) problems.push(at + ': the period "' + get('period') + '" is not 1-7');
    if (!c.name) problems.push(at + ': no course name');
    if (!c.fill || !c.ink) problems.push(at + ': Fill and Text are colours like C4DBEF');
    if (c.from === null || c.until === null) problems.push(at + ': From and Until are dates like 1/25/2027, or blank');
    courses.push(c);
  }
  if (!courses.length) problems.push('the ' + REF_COURSES + ' tab lists no courses');

  return {ok: true, courses: courses, calendar: refCalendar(problems), problems: problems};
}

/* Build Calendar: three labelled values, then a table of exceptions. Blank
   altogether is not a problem - it is the state before the calendar is out. */
function refCalendar(problems) {
  var sh = tabIfAny(REF_CAL);
  if (!sh) return null;
  var rows = sh.getDataRange().getValues();
  var val = function (label) {
    for (var i = 0; i < rows.length; i++)
      for (var j = 0; j < rows[i].length - 1; j++)
        if (String(rows[i][j]).trim().toLowerCase() === label) return rows[i][j + 1];
    problems.push('the ' + REF_CAL + ' tab has no "' + label + '" label');
    return '';
  };
  var cal = {first: refIso(val('first school day')), last: refIso(val('last day to build')),
             cycle: String(val('its cycle day')).trim(), exceptions: []};
  if (cal.first === null) problems.push(REF_CAL + ': First school day is not a date like 1/25/2027');
  if (cal.last === null) problems.push(REF_CAL + ': Last day to build is not a date like 6/17/2027');
  if (cal.cycle && !/^[1-7]$/.test(cal.cycle)) problems.push(REF_CAL + ': Its cycle day is 1-7');
  cal.cycle = cal.cycle ? Number(cal.cycle) : null;

  var h = -1, dc = -1, tc = -1, lc = -1;
  for (var i = 0; i < rows.length && h < 0; i++) {
    var low = rows[i].map(function (v) { return String(v).trim().toLowerCase(); });
    if (low.indexOf('date') >= 0 && low.indexOf('type') >= 0) {
      h = i; dc = low.indexOf('date'); tc = low.indexOf('type'); lc = tc + 1;
    }
  }
  if (h < 0) problems.push('the ' + REF_CAL + ' tab has no Date / Type header for its exceptions');
  for (i = h + 1; h >= 0 && i < rows.length; i++) {
    var d = rows[i][dc], type = String(rows[i][tc] || '').trim().toLowerCase();
    var text = String(d == null ? '' : d).trim();
    // the greyed examples, and the note under the table, are not exceptions
    if (!text || /^e\.g\./i.test(text) || !type) continue;
    var at = REF_CAL + ' row ' + (i + 1), iso = refIso(d);
    var kind = /^no[\s-]*school$/.test(type) ? 'off' : /^half[\s-]*day$/.test(type) ? 'half' : type === 'note' ? 'note' : '';
    if (!iso) problems.push(at + ': "' + text + '" is not a date like 2/15/2027');
    else if (!kind) problems.push(at + ': the type is No school, Half day or Note, not "' + type + '"');
    else cal.exceptions.push({iso: iso, kind: kind, label: String(rows[i][lc] || '').trim()});
  }
  if (!cal.first && !cal.last && !cal.exceptions.length) return null;
  if (!cal.last) problems.push(REF_CAL + ': Last day to build is empty');
  return cal;
}

/* '' for blank, null for something that is not a date, else yyyy-mm-dd. A
   date cell arrives as a Date; typed text as 1/25/2027, 1/25/27 or 2027-01-25. */
function refIso(v) {
  if (v === '' || v == null) return '';
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return isNaN(v.getTime()) ? null : v.getFullYear() + '-' + p2(v.getMonth() + 1) + '-' + p2(v.getDate());
  }
  var s = String(v).trim(), m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + p2(+m[1]) + '-' + p2(+m[2]);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : (s ? null : '');
}
function refHex(v) {
  v = String(v).trim().replace(/^#/, '');
  if (/^\d+$/.test(v)) while (v.length < 6) v = '0' + v;     // 033333 typed in a cell is a number
  return /^[0-9A-Fa-f]{6}$/.test(v) ? '#' + v.toUpperCase() : '';
}

/* ---------- the docs app's names (Shared-Contracts §9.4) ---------- */

/* Read straight from the docs workbook, read-only. Its id is the Script
   Property DOCS_ID and never written here: this file is in a public repo.
   Columns are found by header; a missing one is an error, never an empty
   list. Of mod, only whether it is blank is read: it can name a student. */
var DOCS_FILES = '_Files';
var DOCS_FCOLS = ['file id', 'num', 'part', 'name', 'ver', 'role', 'tag', 'mod'];

function docNames() {
  var id = PropertiesService.getScriptProperties().getProperty('DOCS_ID');
  if (!id) return {ok: false, error: 'DOCS_ID is not set in Script Properties'};
  var ss, sh;
  try { ss = SpreadsheetApp.openById(id); sh = ss.getSheetByName(DOCS_FILES); }
  catch (err) { return {ok: false, error: 'the docs workbook would not open: ' + String(err && err.message || err)}; }
  if (!sh) return {ok: false, error: 'the docs workbook has no ' + DOCS_FILES + ' tab'};
  var rows = sh.getDataRange().getDisplayValues();
  var head = (rows[0] || []).map(function (h) { return String(h).trim().toLowerCase(); });
  var col = {};
  var missing = DOCS_FCOLS.filter(function (w) { col[w] = head.indexOf(w); return col[w] < 0; });
  if (missing.length) return {ok: false, error: 'the docs workbook has no ' + missing.join(', ') + ' column'};
  var forms = shortForms(ss);
  if (typeof forms === 'string') return {ok: false, error: forms};
  var note = forms ? '' : 'no ' + DOCS_SHORT + ' tab in the docs workbook, so names are not shortened';
  forms = forms || [];
  var get = function (r, w) { return String(r[col[w]] == null ? '' : r[col[w]]).trim(); };
  var yr = function (r) { return parseInt(get(r, 'ver').slice(0, 2), 10) || 0; };

  // this year: the newest a file was made in. An earlier year's file keeps the
  // name it was handed out under, which its row may no longer match.
  var year = 0, i;
  for (i = 1; i < rows.length; i++) if (get(rows[i], 'file id') && yr(rows[i]) > year) year = yr(rows[i]);
  var files = {}, n = 0;
  for (i = 1; i < rows.length; i++) {
    var r = rows[i], fid = get(r, 'file id');
    if (/\//.test(fid)) fid = fileId(fid);
    if (!fid || yr(r) !== year || !get(r, 'num') || !get(r, 'name')) continue;
    var f = {head: get(r, 'num') + (get(r, 'part') ? '.' + get(r, 'part') : ''), name: shorten(get(r, 'name'), forms),
             ver: get(r, 'ver'), tag: get(r, 'tag'), role: get(r, 'role'), mod: !!get(r, 'mod')};
    files[fid] = {s: f.head + ' - ' + f.name, f: docName(f)};
    n++;
  }
  return {ok: true, year: String(year), count: n, files: files, note: note};
}

/* Short forms for the start of a name, typed once on the docs workbook's
   "Short names" tab (long | short): "Practice - Springs" reads "Prac - Springs".
   Only a whole leading segment, followed by " - ", is replaced. The tab is
   found whatever its case or stray spaces. No tab gives null, which the caller
   says out loud; a tab without both columns is an error. The homework
   checker's Code.gs has the same two functions, word for word;
   claude/docs-test/test-short-names.js holds them together. */
var DOCS_SHORT = 'Short names';
function shortForms(ss) {
  var want = DOCS_SHORT.toLowerCase(), sh = null;
  ss.getSheets().forEach(function (t) { if (!sh && String(t.getName()).trim().toLowerCase() === want) sh = t; });
  if (!sh) return null;
  var rows = sh.getDataRange().getDisplayValues();
  var head = (rows[0] || []).map(function (h) { return String(h).trim().toLowerCase(); });
  var a = head.indexOf('long'), b = head.indexOf('short');
  if (a < 0 || b < 0) return 'the ' + DOCS_SHORT + ' tab needs a long and a short column';
  return rows.slice(1).map(function (r) { return [String(r[a] || '').trim(), String(r[b] || '').trim()]; })
    .filter(function (p) { return p[0] && p[1]; })
    .sort(function (x, y) { return y[0].length - x[0].length; });    // longest first
}
function shorten(name, forms) {
  name = String(name || '');
  for (var i = 0; i < forms.length; i++) {
    var lead = forms[i][0] + ' - ';
    if (name.slice(0, lead.length).toLowerCase() === lead.toLowerCase()) {
      return forms[i][1] + name.slice(forms[i][0].length);
    }
  }
  return name;
}

/* The docs app's genName() rule, without the file type: tags in the order
   given, (mod), then roles with key and grades last. Docs.gs owns the rule;
   change this copy in the same change. claude/docs-test/test-planner-names.js
   runs both on one table. */
function docName(f) {
  var words = function (v) {
    return String(v == null ? '' : v).toLowerCase().split(/[\s,]+/)
      .filter(function (w, i, a) { return w && a.indexOf(w) === i; });
  };
  var last = {key: 1, grades: 1}, roles = words(f.role), tail = words(f.tag);
  if (f.mod) tail.push('mod');
  tail = tail.concat(roles.filter(function (w) { return !last[w]; }),
                     roles.filter(function (w) { return last[w]; }));
  return f.head + ' - ' + f.name + (f.ver ? ' v.' + f.ver : '') +
         (tail.length ? ' (' + tail.join(') (') + ')' : '');
}

/* ---------- store ---------- */

function recTab() {
  var ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('SHEET_ID') ||
    SpreadsheetApp.getActiveSpreadsheet().getId());
  var sh = ss.getSheetByName(REC_TAB);
  if (!sh) {
    sh = ss.insertSheet(REC_TAB);
    sh.getRange(1, 1, 1, 4).setValues([['key', 'updatedAt', 'device', 'json']])
      .setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.hideSheet();
  }
  return sh;
}

/** every stored row, as { key: {row, updatedAt, device, json} } */
function readAll(sh) {
  var last = sh.getLastRow();
  if (last < 2) return {};
  var vals = sh.getRange(2, 1, last - 1, 4).getValues();
  var out = {};
  for (var i = 0; i < vals.length; i++) {
    var k = String(vals[i][0] || '');
    if (!k) continue;
    out[k] = {row: i + 2, updatedAt: String(vals[i][1] || ''),
              device: String(vals[i][2] || ''), json: String(vals[i][3] || '')};
  }
  return out;
}

/* ---------- pull ---------- */

/**
 * Everything changed since the client last heard from us. `since` is a
 * timestamp WE issued, so the clocks being compared are both the server's —
 * three machines with three slightly wrong clocks never enters into it.
 */
function pull(req) {
  var sh = recTab();
  var all = readAll(sh);
  var since = String(req.since || '');
  var recs = [];
  Object.keys(all).forEach(function (k) {
    var r = all[k];
    if (since && r.updatedAt <= since) return;
    recs.push({key: k, updatedAt: r.updatedAt, device: r.device, lines: parse(r.json)});
  });
  return {ok: true, now: nowIso(), since: since, records: recs, total: Object.keys(all).length};
}

function parse(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch (err) { return null; }
}

/* ---------- push ---------- */

/**
 * Each record carries the updatedAt the client last saw. If the stored copy is
 * newer, someone else wrote it in the meantime and this write is refused rather
 * than applied — the app is told, and shows both. Silent last-writer-wins is
 * how an evening of planning disappears.
 *
 * A record with lines: null is a deletion; the row is cleared but kept, so a
 * client pulling later learns the record went away instead of never hearing.
 */
function push(req) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return {ok: false, error: 'busy, try again'};
  try {
    var sh = recTab();
    var all = readAll(sh);
    var stamp = nowIso();
    var device = String(req.device || 'unknown').slice(0, 40);
    var saved = [], conflicts = [], appends = [];

    (req.records || []).forEach(function (rec) {
      var k = String(rec.key || '');
      if (!k) return;
      var have = all[k];
      var base = String(rec.base || '');

      if (have && have.updatedAt && have.updatedAt !== base) {
        conflicts.push({key: k, updatedAt: have.updatedAt, device: have.device,
                        lines: parse(have.json)});
        return;
      }

      var json = rec.lines ? JSON.stringify(rec.lines) : '';
      if (have) {
        sh.getRange(have.row, 2, 1, 3).setValues([[stamp, device, json]]);
      } else {
        appends.push([k, stamp, device, json]);
        all[k] = {row: -1, updatedAt: stamp, device: device, json: json};
      }
      saved.push({key: k, updatedAt: stamp});
    });

    if (appends.length) {
      var start = sh.getLastRow() + 1;
      if (start + appends.length > MAX_ROWS) return {ok: false, error: 'record tab is full'};
      /* A new tab has 1000 rows and a range past the last one is refused, so
         the record that needed row 1001 would have failed every save from then
         on. Grow ahead of need, in steps large enough that this is rare. */
      var short = start + appends.length - 1 - sh.getMaxRows();
      if (short > 0) sh.insertRowsAfter(sh.getMaxRows(), short + 500);
      sh.getRange(start, 1, appends.length, 4).setValues(appends);
    }
    SpreadsheetApp.flush();
    return {ok: true, now: stamp, saved: saved, conflicts: conflicts};
  } finally {
    lock.releaseLock();
  }
}

/* ---------- backup ---------- */

/**
 * Every record, to Drive, at most once a week - the HW app's stash(), run by
 * the server, since the server holds the records. Each row exactly as stored,
 * so a restore puts back what was there rather than a re-encoding of it.
 *
 * Never throws: a backup that fails must not cost the save it followed. The
 * reason is kept for Check health, and a failure is not retried for a day, so
 * a Drive outage does not slow every save.
 */
function backupIfDue() {
  var p = PropertiesService.getScriptProperties();
  var at = Date.parse(p.getProperty('BACKUP_AT') || '');
  if (at && Date.now() - at < BACKUP_EVERY) return;
  var failed = Date.parse(String(p.getProperty('BACKUP_ERROR') || '').slice(0, 24));
  if (failed && Date.now() - failed < 86400000) return;
  backup();
}

function backup() {
  var p = PropertiesService.getScriptProperties();
  try {
    var all = readAll(recTab());
    var records = Object.keys(all).map(function (k) {
      return {key: k, updatedAt: all[k].updatedAt, device: all[k].device, json: all[k].json};
    });
    var it = DriveApp.getFoldersByName(BACKUP_DIR);
    var dir = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_DIR);
    var name = 'Planner records ' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + '.json';
    var same = dir.getFilesByName(name);             // one file a day, the latest
    while (same.hasNext()) same.next().setTrashed(true);
    dir.createFile(name, JSON.stringify({version: VERSION, made: nowIso(), records: records}),
                   'application/json');

    var kept = [], f = dir.getFiles();
    while (f.hasNext()) { var x = f.next(); kept.push({f: x, t: x.getDateCreated().getTime()}); }
    kept.sort(function (a, b) { return b.t - a.t; });
    for (var i = KEEP_BACKUPS; i < kept.length; i++) kept[i].f.setTrashed(true);

    p.setProperty('BACKUP_AT', nowIso());
    p.deleteProperty('BACKUP_ERROR');
    return {ok: true, name: name, records: records.length, folder: dir.getUrl()};
  } catch (err) {
    var why = String(err && err.message || err);
    p.setProperty('BACKUP_ERROR', nowIso() + ' ' + why);
    console.error('backup failed: ' + why);
    return {ok: false, error: why};
  }
}

/** From the menu or the editor: a backup now, whatever the last one's date. */
function backupNow() {
  var r = backup();
  say(r.ok ? 'Backed up ' + r.records + ' record(s) as ' + r.name + '\n\n' + r.folder
           : 'The backup did not work:\n  ' + r.error);
}

/* ---------- menu ---------- */

/**
 * Show a message wherever this happens to be running.
 *
 * SpreadsheetApp.getUi() exists only when the script runs from the spreadsheet,
 * so anything called from the Apps Script editor threw instead of answering.
 * Reading something should work from either place; only the things that ask a
 * question genuinely need the menu.
 */
function say(msg) {
  try { SpreadsheetApp.getUi().alert(msg); return; } catch (err) { /* no UI here */ }
  Logger.log(msg);
  console.log(msg);
}

/** for the ones that must ask a question — say plainly where to run them */
function mustAsk() {
  try { return SpreadsheetApp.getUi(); } catch (err) {
    throw new Error('Run this from the spreadsheet: Planner sync \u203a ' +
                    'the menu item. It has to ask you something, and the Apps ' +
                    'Script editor has no way to do that.');
  }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Planner sync')
    .addItem('Set up sync', 'setup')
    .addItem('Show token', 'showToken')
    .addItem('Record count', 'recordCount')
    .addSeparator()
    .addItem('Back up records now', 'backupNow')
    .addItem('Check health', 'checkHealth')
    .addItem('Remove dead triggers', 'removeDeadTriggers')
    .addSeparator()
    .addItem('Publish to students now', 'publishNow')
    .addItem('Turn ON auto-publishing', 'installPublishTrigger')
    .addItem('Turn OFF auto-publishing', 'removePublishTrigger')
    .addToUi();
}

function publishNow() {
  var r = publish();
  if (!r.ok) { say(r.error); return; }
  var lines = Object.keys(r.classes).map(function (t) { return t + ': ' + r.classes[t]; });
  var msg = 'Published through ' + r.through + '\n\n' +
            (lines.join('\n') || 'nothing to publish yet') +
            '\n\nDays with something on them, per class.';

  msg += '\n\nEach class page has been rebuilt and is ready to serve.';
  say(msg);
}

/** No UI: this is what the timer calls. */
function publishSilently() {
  try { publish(); } catch (err) { console.error('publish failed: ' + err); }
}

function installPublishTrigger() {
  removePublishTrigger(true);
  ScriptApp.newTrigger('publishSilently').timeBased().everyMinutes(15).create();
  say(
    'Auto-publishing is ON.\n\nStudents see changes within about 15 minutes. ' +
    'Anything in // or (( )) stays private, so unfinished notes are safe.');
}

function removePublishTrigger(quiet) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'publishSilently') ScriptApp.deleteTrigger(t);
  });
  if (!quiet) say('Auto-publishing is OFF.');
}

/**
 * What is actually installed and how big everything has got. The old Publish.gs
 * set an onEdit trigger on this spreadsheet; if that file is gone but the
 * trigger is not, every edit fires a handler that no longer exists — which is
 * exactly what makes a sheet feel slow.
 */
function checkHealth() {
  var lines = ['Endpoint ' + VERSION, ''];
  var ss = SpreadsheetApp.getActive();
  var mine = {publishOnTimer: 1, publishSilently: 1, publishIfDirty: 1,
              onPlannerEdit: 1, publishAll: 1};
  var orphans = 0;

  lines.push('TRIGGERS');
  var trigs = ScriptApp.getProjectTriggers();
  if (!trigs.length) lines.push('  none installed');
  trigs.forEach(function (t) {
    var fn = t.getHandlerFunction();
    var exists = false;
    try { exists = (typeof this[fn] === 'function'); } catch (e) {}
    if (!exists) { try { exists = eval('typeof ' + fn) === 'function'; } catch (e) { exists = false; } }
    if (!exists) orphans++;
    lines.push('  ' + fn + '  (' + t.getEventType() + ')' +
               (exists ? '' : '   <-- this function no longer exists'));
  });
  if (orphans) {
    lines.push('');
    lines.push('  ' + orphans + ' trigger(s) point at code that is gone.');
    lines.push('  Every edit fires them and they fail. Run "Remove dead triggers".');
  }

  lines.push('');
  lines.push('STUDENT PAGES');
  var cache = CacheService.getScriptCache();
  var cal = getCalendar() || {courses: {}};
  var tags = Object.keys(cal.courses).map(function (k) { return cal.courses[k].tag; });
  var ready = 0;
  tags.forEach(function (t) {
    var got = false;
    try { got = !!cache.get('html:' + t); } catch (e) {}
    if (got) ready++;
    lines.push('  ' + t + ': ' + (got ? 'ready' : 'will be built on the first request'));
  });
  if (!tags.length) lines.push('  no calendar yet, so no classes to serve');
  else if (ready < tags.length) lines.push('  Publish rebuilds them all.');

  lines.push('');
  lines.push('COURSES AND BUILD CALENDAR');
  try {
    var rf = reference();
    if (!rf.ok) lines.push('  NOT READ: ' + rf.error);
    else {
      lines.push('  ' + rf.courses.length + ' course row(s): ' + rf.courses.map(function (c) {
        return 'P' + c.period + ' ' + c.name + (c.from ? ' from ' + c.from : '') + (c.until ? ' until ' + c.until : '');
      }).join(', '));
      lines.push('  ' + (rf.calendar ? 'Build Calendar: ' + (rf.calendar.first || 'continuing') + ' to ' +
        rf.calendar.last + ', ' + rf.calendar.exceptions.length + ' exception(s)' : 'Build Calendar: not filled in yet'));
      rf.problems.forEach(function (p) { lines.push('  PROBLEM: ' + p); });
    }
  } catch (err) { lines.push('  NOT READ: ' + err); }
  lines.push('');
  lines.push('DOCS APP NAMES');
  var dp = PropertiesService.getScriptProperties();
  lines.push('  ' + (dp.getProperty('DOCS_ID') ? 'DOCS_ID stored' : 'DOCS_ID MISSING \u2014 add it in Project Settings \u203a Script Properties'));
  lines.push('  last publish: ' + (dp.getProperty('DOCS_STATE') || 'not yet'));
  lines.push('');
  lines.push('BACKUP');
  var bp = PropertiesService.getScriptProperties();
  var bAt = bp.getProperty('BACKUP_AT'), bErr = bp.getProperty('BACKUP_ERROR');
  lines.push('  ' + (bAt ? 'last copy ' + bAt.slice(0, 10) + ', in Drive \u203a ' + BACKUP_DIR
                         : 'none yet \u2014 the next save makes one, or "Back up records now"'));
  if (bErr) lines.push('  THE LAST ATTEMPT FAILED: ' + bErr);
  /* The code that wrote to GitHub is gone. A credential it stored is not, and
     nothing here can use it or would notice it. */
  if (bp.getProperty('GH_TOKEN') || bp.getProperty('GH_REPO')) {
    lines.push('');
    lines.push('GITHUB');
    lines.push('  A GitHub credential is still stored and nothing uses it. Delete');
    lines.push('  GH_TOKEN, GH_REPO and lastFeedPush in Project Settings \u203a');
    lines.push('  Script Properties, then revoke the token on GitHub.');
  }

  lines.push('');
  lines.push('OTHER CODE IN THIS PROJECT');
  /* Apps Script shares ONE namespace across every .gs file in the project, and
     the last file parsed wins. A leftover Publish.gs or Extend.gs — or a file
     something was pasted into by mistake — can therefore replace a function in
     Sync.gs without a word, and the deployment then runs code I thought was
     gone. Checking for names that only retired files define catches it. */
  var strays = [];
  ['readAbsences', 'readGradebookConfig', 'readStudentLinks', 'inspectTab',
   'resolveTabs', 'buildCycle', 'extendRotation', 'pushFeeds', 'ghCommitAll'
  ].forEach(function (n) {
    var there = false;
    try { there = eval('typeof ' + n) === 'function'; } catch (e) { there = false; }
    if (there) strays.push(n);
  });
  if (!strays.length) {
    lines.push('  none \u2014 Sync.gs is the only code loaded');
  } else {
    lines.push('  RETIRED CODE IS STILL LOADED:');
    lines.push('    ' + strays.join(', '));
    lines.push('  These are defined by Publish.gs or Extend.gs, which retired.');
    lines.push('  Every .gs file in a project shares one namespace and the last');
    lines.push('  one parsed wins, so these can be quietly replacing functions');
    lines.push('  in Sync.gs. Delete those files from this project.');
  }

  lines.push('');
  lines.push('TABS');
  /* Empty rows cost nothing — 1000 is the default for any tab — so that is
     not reported. Colour rules are reported only when there are enough to
     matter, because Sheets re-evaluates every one on every change. */
  var heavy = [];
  ss.getSheets().forEach(function (sh) {
    var rules = 0;
    try { rules = sh.getConditionalFormatRules().length; } catch (e) {}
    if (rules > 40) heavy.push(sh.getName() + ' (' + rules + ' colour rules)');
    lines.push('  ' + sh.getName() + ': ' + sh.getLastRow() + ' rows' +
               (rules ? ', ' + rules + ' colour rules' : ''));
  });
  if (heavy.length) {
    lines.push('');
    lines.push('SLOW: ' + heavy.join(', '));
    lines.push('  Sheets re-evaluates every rule on every change. If nothing');
    lines.push('  reads that tab any more, delete it \u2014 copy the file first.');
  }
  say(lines.join('\n'));
}

/** Delete any trigger whose handler is not in this project any more. */
function removeDeadTriggers() {
  var ui = mustAsk();
  var gone = [];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction(), exists = false;
    try { exists = eval('typeof ' + fn) === 'function'; } catch (e) { exists = false; }
    if (!exists) { ScriptApp.deleteTrigger(t); gone.push(fn); }
  });
  ui.alert(gone.length
    ? 'Removed ' + gone.length + ' dead trigger(s):\n\n  ' + gone.join('\n  ')
    : 'Every trigger points at code that exists. Nothing removed.');
}

function showToken() {
  var p = PropertiesService.getScriptProperties();
  var t = p.getProperty('TOKEN');
  if (!t) { say('No token yet — run First-time setup.'); return; }
  var url = p.getProperty('EXEC_URL') || '';
  // the whole address, ready to paste, so the token cannot be mis-copied
  say(
    'Token (' + t.length + ' characters):\n\n' + t +
    '\n\nDiagnostics, if you have the /exec address:\n' +
    '  <your exec url>?check=1&token=' + t +
    '\n\nJust the version, no token needed:\n' +
    '  <your exec url>?ping=1');
}

function recordCount() {
  var all = readAll(recTab());
  var keys = Object.keys(all);
  var live = keys.filter(function (k) { return all[k].json; }).length;
  say(
    keys.length + ' record(s), ' + live + ' with content.\n\n' +
    (keys.length ? 'Most recent: ' + keys.map(function (k) { return all[k].updatedAt; })
      .sort().pop() : ''));
}
