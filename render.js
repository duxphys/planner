/* Rendering. WEEKS (data.js) is the model — editor.js mutates it in place. */

const SIZES = [10, 11, 12.5, 14, 16];
const COLOUR = ['header', 'tinted', 'full'];
/* how much of the cell the course colour fills: none, half, all */
const FILLS = [
  '',
  '<path d="M2.5 8a5.5 5.5 0 0 0 11 0z" class="on"/>',
  '<circle cx="8" cy="8" r="5.5" class="on"/>'
];
const FILL_ICON = i => '<svg viewBox="0 0 16 16">' +
  '<circle cx="8" cy="8" r="5.5"/>' + FILLS[i] + '</svg>';

/* Icons for the things you switch between; words stay on the things that have
   something to report. A mode you flip twice a day is learned in a day; a
   status you only read when it is wrong has to say what is wrong. */
const SVG = p => '<svg viewBox="0 0 16 16">' + p + '</svg>';

/* nine cells; the listed ones are filled, the rest faint */
function CHECKER(on) {
  const at = i => 1.6 + i * 4.6;
  const lit = new Set(on.map(([c, r]) => c + ',' + r));
  let out = '';
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    out += '<rect x="' + at(c) + '" y="' + at(r) + '" width="3.6" height="3.6" rx="0.7"' +
           ' class="' + (lit.has(c + ',' + r) ? 'on' : 'off') + '"/>';
  }
  return out;
}
const ICONS = {
  /* A 3x3 of the grid itself, with one class lit up. In the by-class view a
     course is a single row; by schedule it is scattered down the diagonal,
     because P1 falls on Block 1 Wednesday, Block 3 Thursday, Block 5 Friday.
     The icon shows what happens to one class, not an abstract shape. */
  columns: SVG(CHECKER([[0,0],[1,1],[2,2]])),      // by schedule: a diagonal
  rows:    SVG(CHECKER([[0,1],[1,1],[2,1]])),      // by class: one row
  eye:     SVG('<path d="M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8s-2.4 4.2-6.5 4.2S1.5 8 1.5 8z"/>' +
               '<circle cx="8" cy="8" r="1.9"/>'),
  pencil:  SVG('<path d="M11.6 2.4l2 2-7.4 7.4-3 1 1-3z"/><path d="M2 14.6h12"/>'),
  target:  SVG('<circle cx="8" cy="8" r="5"/><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none"/>'),
  cloud:   SVG('<path d="M4.6 12.5h7a3 3 0 0 0 .3-6 4 4 0 0 0-7.7-.8 2.6 2.6 0 0 0 .4 6.8z"/>' +
               '<path d="M6.2 9.2l1.5 1.5 2.6-3"/>'),
  send:    SVG('<path d="M4.6 12.5h7a3 3 0 0 0 .3-6 4 4 0 0 0-7.7-.8 2.6 2.6 0 0 0 .4 6.8z"/>' +
               '<path d="M8 10.6V6.2M6.3 7.7L8 6l1.7 1.7"/>')
};
/* Five weekdays at a time, but a sliding window rather than a fixed week —
   so a Thursday can be seen with Tuesday and next Monday either side of it.
   Records are keyed by date and period, so which five days are on screen is
   only ever a question of display. */
const DAYS = [];
WEEKS.forEach((w, wIdx) => w.days.forEach((d, dIdx) => DAYS.push({d, w: wIdx, i: dIdx})));
/* How many weekdays are on screen. A preference, because it belongs to the
   machine — a MacBook has room for six, a school laptop reads better with four.
   Still consecutive weekdays; never the seven-day rotation. */
let SPAN = 5;
const SPANS = [2, 3, 4, 5, 6];
const clampStart = v => Math.max(0, Math.min(v, Math.max(0, DAYS.length - SPAN)));

let winStart = 0, si = 2, ci = 1, byClass = false, hidePrep = false, student = false, tight = false;

/* three rules, drawn close or far apart — the button shows the spacing you get */
const LINES = t => '<svg viewBox="0 0 16 16">' +
  (t ? '<path d="M2 5h12M2 8h12M2 11h12"/>' : '<path d="M2 3h12M2 8h12M2 13h12"/>') + '</svg>';
const off = new Set();                       // periods switched off
const shown = p => !off.has(p);

/* Never assume an element is there. A half-finished upload used to throw and
   take the whole grid down with it; a missing button is a far better failure
   than a blank page. */
const at = id => document.getElementById(id);

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* every course in the file, so the switches don't move week to week */
const ALL = (() => {
  const m = new Map();
  for (const w of WEEKS) for (const d of w.days) for (const b of d.blocks)
    if (b.course) m.set(b.period, b.course);
  return [...m.keys()].sort((a, z) => a - z).map(p => [p, m.get(p)]);
})();

/* Day notes start life as the plain string the sheet had; from here they are
   records like any other cell, so they can be edited and synced. */
const asLines = t => t
  ? [{bullet: false, private: false, spans: [{t: t, url: null, rel: false, priv: false}]}]
  : null;

/* Two separate fields under a date, and they mean different things:
   offLines  the school's reason for no school — students see this
   noteLines my own note for the day — teacher only, never published */
for (const w of WEEKS) for (const d of w.days) {
  if (d.noteLines === undefined) d.noteLines = asLines(d.note);
  if (d.offLines === undefined) d.offLines = asLines(d.cycle ? '' : d.off);
}

/** the school's reason, as plain text, for the band across the day */
function offText(d) {
  if (!d.offLines) return d.off || '';
  return d.offLines.filter(Boolean).map(l => l.spans.map(s => s.t).join('')).join(' ').trim();
}

/* A day the calendar never had school: nothing was ever planned, so the whole
   column merges into one band. */
const isOff = d => !d.cycle;

/* A day I cancelled after the fact — a snow day. The rotation carries on by
   date, so nothing shifts; but there is work in those cells I still have to
   move somewhere, so they stay readable and every block says why. */
const isCancelled = d => !!d.cycle && !!offText(d);

function todayISO() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** the first school day that is today or later — on a Saturday, Monday */
function todayIndex() {
  const iso = todayISO();
  const i = DAYS.findIndex(x => x.d.iso >= iso);
  return i < 0 ? DAYS.length - 1 : i;
}

/* today in the middle of the five. On a weekend that puts Monday there,
   because the search lands on the next school day. */
const centreOnToday = () => { winStart = clampStart(todayIndex() - Math.floor(SPAN / 2)); };

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function shortDate(iso) {
  const p = iso.split('-');
  return MONTHS[+p[1] - 1] + ' ' + (+p[2]);
}

/** the range on screen, e.g. SEP 2 – SEP 8, 2026 */
/* Only the closing year. A five-day range that starts in December and ends in
   January needs no help being understood, and carrying both years would widen
   the box all year for one week of it. */
function windowLabel(view) {
  if (!view.length) return '';
  const a = view[0].d.iso, b = view[view.length - 1].d.iso;
  return shortDate(a) + ' \u2013 ' + shortDate(b) + ', ' + b.split('-')[0];
}

/* Hold the label box open at the width of the longest label in the file. */
let sized = false;
function sizeWeekLabel() {
  if (sized) return;
  const box = at('wksizer');
  if (!box) return;
  let longest = '';
  for (let i = 0; i + SPAN <= DAYS.length; i++) {
    const t = windowLabel(DAYS.slice(i, i + SPAN));
    if (t.length > longest.length) longest = t;
  }
  box.textContent = longest;
  sized = true;
}

function tintOf(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = i => Math.round(255 + ((n >> i & 255) - 255) * k);
  return `rgb(${f(16)},${f(8)},${f(0)})`;
}
const bodyBG = c => ci === 0 ? '' : `background:${tintOf(c.fill, ci === 1 ? .55 : 1)};`;

function roster(view) {
  const seen = new Map();
  for (const x of view) for (const b of x.d.blocks)
    if (b.course && shown(b.period)) seen.set(b.period, b.course);
  return [...seen.keys()].sort((a, z) => a - z).map(p => [p, seen.get(p)]);
}

/* ---------- lines -> html ---------- */

function lineHTML(l) {
  if (!l) return '<div class="ln"><br></div>';
  // one wrapper per (( )) run, not per span, so the brackets the CSS draws
  // appear once around the whole note rather than around every fragment
  let inner = '', inPriv = false;
  for (const s of l.spans) {
    if (s.priv && student) continue;                 // (( )) never reaches students
    if (s.priv && !inPriv) { inner += '<span class="pvs">'; inPriv = true; }
    else if (!s.priv && inPriv) { inner += '</span>'; inPriv = false; }
    const t = esc(s.t) || '&nbsp;';
    if (!s.url) { inner += t; continue; }
    if (s.rel) inner += `<a class="l" href="${s.url}" data-u="${s.url}" data-r="1">${t}</a>`;
    // preview only: a held link reads as plain text, with a faint rule so it can
    // still be found. The generated student page emits no marker at all.
    else if (student) inner += `<span class="pend">${t}</span>`;
    else inner += `<a class="h" href="${s.url}" data-u="${s.url}" data-r="0">${t}</a>`;
  }
  if (inPriv) inner += '</span>';
  if (student && !inner.trim()) return '';           // nothing left once hidden
  return `<div class="ln${l.bullet ? ' b' : ''}${l.private ? ' pv' : ''}"` +
         `${l.bullet ? ' data-b="1"' : ''}${l.private ? ' data-p="1"' : ''}>${inner || '<br>'}</div>`;
}

function lines(ls) {
  if (!ls || !ls.length) return '';
  return ls.filter(l => !(student && l && l.private)).map(lineHTML).join('');   // '//' lines
}

/* Absences are held in memory by sync.js and never stored on this machine.
   Teacher-only: the rows they sit in are not drawn in the student view. */
function absText(iso, period) {
  if (typeof absent === 'undefined' || !absent || !iso) return '';
  const p = iso.split('-');
  const v = absent['P' + period + '|' + (+p[1]) + '/' + (+p[2])];
  if (!v) return '';                     // attendance not taken: say nothing
  return v.map(t => `<div class="ln${t === 'All here' ? ' allhere' : ''}">${esc(t)}</div>`).join('');
}

function held(b) {
  let n = 0;
  for (const ls of [b.cw, b.hw])
    for (const l of (ls || [])) if (l && !l.private)
      for (const s of l.spans) if (s.url && !s.rel && !s.priv) n++;
  return n;
}
const heldTag = b => { const n = held(b); return (n && !student) ? `<span class="heldn">${n} held</span>` : ''; };

/* ---------- grid ---------- */

/* the block layout is the same every day, so one day serves as the template */
const BLOCK_PROTO = (DAYS.find(x => x.d.cycle) || DAYS[0]).d.blocks;

const P = [];
const put = (col, row, span, cls, style, html, attrs) =>
  P.push(`<div class="${cls}" style="grid-column:${col};grid-row:${row}/span ${span};${style || ''}"` +
         `${attrs || ''}>${html || ''}</div>`);

/* which record a cell edits */
const key = (w, d, bi) => `${w}.${d}.${bi}`;
const ref = (w, d, bi, f) => ` data-w="${w}" data-d="${d}" data-bi="${bi}" data-f="${f}"` +
                             ` data-h="${key(w, d, bi)}"`;

/* Toolbar and switches — everything above the grid. */
/* How tall the toolbar is right now, so the date row can pin directly under it.
   Re-measured on every render and on resize, because the header wraps. */
function measureHeader() {
  const h = document.querySelector('header');
  if (!h) return;
  const px = Math.round(h.getBoundingClientRect().height);
  if (px) document.documentElement.style.setProperty('--hdr', px + 'px');
}

function paintChrome(view) {
  document.documentElement.style.setProperty('--fs', SIZES[si] + 'px');
  document.documentElement.style.setProperty('--lh', tight ? '1.25' : '1.4');
  document.documentElement.style.setProperty('--cols', SPAN);
  if (at('span')) { at('span').textContent = SPAN; at('span').title = SPAN + ' days on screen'; }
  (at('tight') || {}).innerHTML = LINES(!tight);
  if (at('colour')) { at('colour').innerHTML = FILL_ICON(ci); at('colour').title = 'Colour: ' + COLOUR[ci]; }
  if (at('tview')) {
    at('tview').innerHTML = byClass ? ICONS.columns : ICONS.rows;
    at('tview').title = byClass ? 'By schedule' : 'By class';
  }
  if (at('tstu')) {
    at('tstu').innerHTML = student ? ICONS.pencil : ICONS.eye;
    at('tstu').title = student ? 'Teacher view' : 'Student view';
  }
  document.body.classList.toggle('ed-off', student);

  sizeWeekLabel();
  const home = winStart === clampStart(todayIndex() - Math.floor(SPAN / 2));
  if (at('wklabel')) at('wklabel').textContent = windowLabel(view);
  if (at('today')) {
    at('today').innerHTML = ICONS.target;
    at('today').disabled = home;
    at('today').title = home ? 'Already at today' : 'Back to today';
  }
  const last = Math.max(0, DAYS.length - SPAN);
  ['prev', 'prevWk'].forEach(id => { if (at(id)) at(id).disabled = winStart === 0; });
  ['next', 'nextWk'].forEach(id => { if (at(id)) at(id).disabled = winStart === last; });

  const allOn = ALL.every(([p]) => shown(p)) && (byClass || !hidePrep);
  if (at('classbar')) at('classbar').innerHTML =
    ALL.map(([p, c]) =>
      `<button class="cb" data-p="${p}" aria-pressed="${shown(p)}"` +
      (shown(p) ? ` style="background:${c.fill};color:${c.ink}"` : '') +
      `>${c.sym}\u00A0${c.tag}</button>`).join('') +
    (byClass ? '' : `<button class="cb" data-p="prep" aria-pressed="${!hidePrep}"` +
      (hidePrep ? '' : ` style="background:var(--rail);color:var(--slate)"`) + `>Prep</button>`) +
    `<button class="cb" data-p="all" aria-pressed="${allOn}"` +
    (allOn ? ` style="background:var(--rail);color:var(--ink)"` : '') + `>All</button>` +
    `<span id="hint">${(typeof absentNote !== 'undefined' && absentNote && !student)
        ? '\u26a0 ' + esc(absentNote) : ''}</span>`;
}

/* The date row across the top. */
function paintHeaders(view) {
  put(1, 1, 1, 'corner');
  const iso = todayISO();
  view.forEach(({d, w: wi, i}, col) => put(col + 2, 1, 1,
    'dh' + (d.iso === iso ? ' today' : ''), '',
    `<div class="dhtop"><b>${d.d}${d.iso === iso ? '<i>today</i>' : ''}</b>` +
    `<span>${!d.cycle ? 'No school'
       : (student && isCancelled(d)) ? '' : 'Day ' + d.cycle}</span></div>` +
    (student
      ? (isCancelled(d) ? `<em>${esc(offText(d))}</em>` : '')
      : `<div class="dhoff${isCancelled(d) ? ' cancelled' : ''}" data-w="${wi}" ` +
        `data-d="${i}" data-f="off" data-h="${wi}.${i}.o">${lines(d.offLines)}</div>`) +
    (student ? '' : `<div class="dhnote" data-w="${wi}" data-d="${i}" ` +
      `data-f="note" data-h="${wi}.${i}.n">${lines(d.noteLines)}</div>`)));
}

function paintByClass(view, r) {

    for (const [per, c] of roster(view)) {
      // a course that picks up ASP any day this week gets its own row for it,
      // so every day keeps the same rows and the columns stay aligned
      const hasAsp = view.some(({d}) => d.cycle &&
        d.blocks.some(b => b.period === per && b.block === 'ASP') &&
        d.blocks.some(b => b.period === per && b.block !== 'ASP'));
      // ASP sits below the absence line, which separates it from the block
      const absRow = student ? -1 : 3;
      const aspRow = hasAsp ? (student ? 3 : 4) : -1;
      const rowsN = 3 + (hasAsp ? 1 : 0) + (student ? 0 : 1);
      put(1, r, 1, 'rc bt', `background:${c.fill};color:${c.ink}`, `<b>${c.sym} ${c.tag}</b>`);
      put(1, r + 1, 1, 'rl', '', 'Class work');
      put(1, r + 2, 1, 'rl', '', 'Homework');
      if (absRow > 0) put(1, r + absRow, 1, 'rl', '', 'Absent');
      if (aspRow > 0) put(1, r + aspRow, 1, 'rl', '', 'ASP');
      view.forEach(({d, w: wi, i: di}, ci2) => {
        const col = ci2 + 2;
        const idx = d.cycle ? d.blocks.map((b, i) => [b, i]).filter(([b]) => b.period === per) : [];
        if (!idx.length) {
          put(col, r, rowsN, 'cell off bt', '', d.cycle ? '' : `<div class="offtag">${esc(offText(d) || 'No school')}</div>`);
          return;
        }
        const [main, mi] = idx.find(([b]) => b.block !== 'ASP') || idx[0];
        const other = idx.find(([b]) => b.block !== main.block);
        put(col, r, 1, 'chd bt', `background:${c.fill};color:${c.ink}`,
            `<span class="who"><span class="tg">${c.sym}\u00A0${c.tag}</span> ` +
            `<span class="nm">${c.name} &middot; ${main.block}</span>` +
            (main.t0 ? `<span class="tm">${main.t0}\u2013${main.t1}</span>` : '') +
            `</span>` +
            (isCancelled(d) ? `<span class="cxl">${esc(offText(d))}</span>` : '') +
            heldTag(main),
            ` data-h="${key(wi, di, mi)}"`);
        put(col, r + 1, 1, 'cell sub', bodyBG(c), lines(main.cw), ref(wi, di, mi, 'cw'));
        put(col, r + 2, 1, 'cell sub', bodyBG(c), lines(main.hw), ref(wi, di, mi, 'hw'));
        // no ASP for this course today: grey, like any period that doesn't run.
        // Left tinted it looked identical to an empty cell you could write in.
        if (absRow > 0) put(col, r + absRow, 1, 'cell sub abs', bodyBG(c),
                           absText(d.iso, main.period));
        if (aspRow > 0) {
          if (other) put(col, r + aspRow, 1, 'cell sub', bodyBG(c),
                         lines(other[0].cw), ref(wi, di, other[1], 'cw'));
          else put(col, r + aspRow, 1, 'cell off', '', '');
        }
      });
      r += rowsN;
    }
  return r;
}

function paintBySchedule(view, r) {

    /* First work out which block rows will be drawn and how tall each is, so a
       no-school day can be merged into one band across all of them rather than
       labelling only the first and leaving the rest blank. */
    const plan = [];
    let planRow = r;
    BLOCK_PROTO.forEach((proto, bi) => {
      if (hidePrep && !view.some(({d}) => d.blocks[bi] && d.blocks[bi].course && shown(d.blocks[bi].period))) return;
      const isAsp = proto.block === 'ASP';
      const last = isAsp ? 2 : 3;
      const span = last + (student ? 0 : 1);
      plan.push({proto, bi, isAsp, last, span, row: planRow});
      planRow += span;
    });
    const bodyTop = r, bodyRows = planRow - r;

    // a day with no school at all: one band, once, across the whole column
    view.forEach(({d}, col) => {
      if (!isOff(d) || !bodyRows) return;
      put(col + 2, bodyTop, bodyRows, 'cell off bt offday', '',
          `<div class="offtag">${esc(offText(d) || 'No school')}</div>`);
    });

    plan.forEach(({proto, bi, isAsp, last, span}) => {
      put(1, r, 1, 'rb bt', '', `<b>${proto.block}</b>`);
      put(1, r + 1, 1, 'rl', '', isAsp ? 'Notes' : 'Class work');
      if (!isAsp) put(1, r + 2, 1, 'rl', '', 'Homework');
      if (!student) put(1, r + last, 1, 'rl', '', 'Absent');
      view.forEach(({d, w: wi, i: di}, ci2) => {
        const col = ci2 + 2;
        if (isOff(d)) return;                        // already merged above
        const b = d.blocks[bi], c = b.course;
        if (c && !shown(b.period)) {                 // a class switched off
          put(col, r, span, 'cell prep bt', '', '');
          return;
        }
        if (!c) {                                    // a free period
          if (hidePrep || student) { put(col, r, span, 'cell prep bt', '', ''); return; }
          // a header and a box: meetings and duties land in these blocks too
          put(col, r, 1, 'chd prephd bt', '',
              `<span class="tg">P${b.period}</span> <span class="nm">Prep</span>`);
          put(col, r + 1, span - 1, 'cell sub prepbox', '',
              lines(b.prep), ref(wi, di, bi, 'prep'));
          return;
        }
        put(col, r, 1, 'chd bt', `background:${c.fill};color:${c.ink}`,
            `<span class="who"><span class="tg">${c.sym}\u00A0${c.tag}</span> ` +
            `<span class="nm">${c.name}</span>` +
            (b.t0 ? `<span class="tm">${b.t0}\u2013${b.t1}</span>` : '') +
            `</span>` +
            (isCancelled(d) ? `<span class="cxl">${esc(offText(d))}</span>` : '') +
            heldTag(b),
            ` data-h="${key(wi, di, bi)}"`);
        put(col, r + 1, 1, 'cell sub', bodyBG(c), lines(b.cw), ref(wi, di, bi, 'cw'));
        if (!isAsp) put(col, r + 2, 1, 'cell sub', bodyBG(c), lines(b.hw), ref(wi, di, bi, 'hw'));
        // one attendance mark per class per day, so ASP borrows the block's
        if (!student) put(col, r + last, 1, 'cell sub abs', bodyBG(c),
                          absText(d.iso, b.period));
      });
      r += span;
    });
  return r;
}

function render() {
  winStart = clampStart(winStart);        // never draw from outside the calendar
  const view = DAYS.slice(winStart, winStart + SPAN);
  paintChrome(view);

  P.length = 0;
  paintHeaders(view);
  (byClass ? paintByClass : paintBySchedule)(view, 2);
  document.getElementById('app').innerHTML = '<div class="grid">' + P.join('') + '</div>';
  measureHeader();
  if (typeof restoreSelection === 'function') restoreSelection();
  savePrefs();
}

/* ---------- preferences, per machine ---------- */

const PREFS = 'planner.view.v1';
function savePrefs() {
  try {
    localStorage.setItem(PREFS, JSON.stringify(
      {si, ci, SPAN, byClass, student, tight, hidePrep, off: [...off]}));
  } catch (e) { /* storage unavailable */ }
}
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) || '{}');
    if (Number.isInteger(p.si) && p.si >= 0 && p.si < SIZES.length) si = p.si;
    if (Number.isInteger(p.ci) && p.ci >= 0 && p.ci < COLOUR.length) ci = p.ci;
    if (SPANS.indexOf(p.SPAN) >= 0) SPAN = p.SPAN;
    byClass = !!p.byClass; student = !!p.student;
    tight = !!p.tight; hidePrep = !!p.hidePrep;
    if (Array.isArray(p.off)) p.off.forEach(x => off.add(+x));
  } catch (e) { /* unreadable */ }
}

/* ---------- toolbar ---------- */

function wireToolbar() {
  // the toolbar wraps at narrow widths, so the offset has to follow it
  window.addEventListener('resize', measureHeader);
  const on = (id, fn) => document.getElementById(id).onclick = e => { fn(e.currentTarget); render(); };
  on('span', () => {
    SPAN = SPANS[(SPANS.indexOf(SPAN) + 1) % SPANS.length];
    sized = false;                        // the label box is measured per span
    centreOnToday();
  });
  on('prevWk', () => winStart = clampStart(winStart - SPAN));
  on('prev', () => winStart = clampStart(winStart - 1));
  on('next', () => winStart = clampStart(winStart + 1));
  on('nextWk', () => winStart = clampStart(winStart + SPAN));
  on('today', () => centreOnToday());
  on('wklabel', () => centreOnToday());          // the dates work as well
  on('smaller', () => si = Math.max(0, si - 1));
  on('bigger', () => si = Math.min(SIZES.length - 1, si + 1));
  on('colour', () => ci = (ci + 1) % COLOUR.length);
  on('tview', () => byClass = !byClass);
  on('tstu', () => student = !student);
  on('tight', el => {
    const v = el.getAttribute('aria-pressed') !== 'true';
    el.setAttribute('aria-pressed', v); tight = v;
  });
  ['classbar'].forEach(id => document.getElementById(id).addEventListener('click', e => {
    const b = e.target.closest('.cb');
    if (!b) return;
    if (b.dataset.p === 'all') {
      // everything showing: put them all away. otherwise: bring them all back.
      const on = ALL.every(([p]) => shown(p)) && !hidePrep;
      if (on) { ALL.forEach(([p]) => off.add(p)); hidePrep = true; }
      else { off.clear(); hidePrep = false; }
      render(); return;
    }
    if (b.dataset.p === 'prep') { hidePrep = !hidePrep; render(); return; }
    const p = +b.dataset.p;
    off.has(p) ? off.delete(p) : off.add(p);
    render();
  }));

  const bar = document.getElementById('bar');
  document.addEventListener('mouseover', e => {
    const a = e.target.closest('a[data-u]');
    if (!a) { bar.classList.remove('on'); return; }
    bar.querySelector('b').textContent = a.dataset.r === '1' ? 'Released' : 'Not released';
    bar.querySelector('span').textContent = a.dataset.u;
    bar.classList.add('on');
  });
}

function start() {
  loadPrefs();
  centreOnToday();
  wireToolbar();
  wireEditor();
  render();
  if (typeof wireSync === 'function') wireSync();
}
