/* Editing.
 *
 * A cell edits in place. While it's open, private and bullet markers are shown
 * as literal text so they can be typed and deleted like anything else. Links
 * are never markers — they stay real anchors carrying a url and a released
 * flag, and survive every edit as data.
 */

let editing = null;

/* ---------- model -> editable html (markers visible) ---------- */

function editHTML(ls) {
  if (!ls || !ls.length) return '<div class="ln"><br></div>';
  return ls.map(l => {
    if (!l) return '<div class="ln"><br></div>';
    const lead = l.bullet ? '- ' : (l.private ? '// ' : '');
    let inner = esc(lead);
    let wasPriv = false;
    for (const s of l.spans) {
      if (s.priv && !wasPriv) inner += '((';         // markers are typed text again
      if (!s.priv && wasPriv) inner += '))';
      wasPriv = !!s.priv;
      const t = esc(s.t);
      if (!s.url) { inner += t; continue; }
      // every link is followed by a caret slot, not just one that ends a line:
      // without it the caret sits on the anchor's own edge and the next thing
      // typed is swallowed into the link
      inner += `<a class="${s.rel ? 'l' : 'h'}" data-u="${esc(s.url)}" ` +
               `data-r="${s.rel ? 1 : 0}">${t || '&nbsp;'}</a>\u200B`;
    }
    if (wasPriv) inner += '))';
    return `<div class="ln">${inner || '<br>'}</div>`;
  }).join('');
}

/* ---------- editable html -> model ---------- */

function spansOf(node) {
  const spans = [];
  const push = (t, url, rel, priv) => {
    t = t.replace(/\u200B/g, '');                    // caret holders, not content
    if (!t) return;
    const prev = spans[spans.length - 1];
    if (prev && prev.url === url && prev.rel === rel && prev.priv === priv) prev.t += t;
    else spans.push({t, url, rel, priv});
  };
  const walk = (n, url, rel, priv) => {
    if (n.nodeType === 3) { push(n.nodeValue, url, rel, priv); return; }
    if (n.nodeName === 'BR') return;
    let u = url, r = rel, p = priv;
    if (n.nodeName === 'A') {
      u = n.dataset.u || n.getAttribute('href') || null;
      r = n.dataset.r !== undefined ? n.dataset.r === '1' : n.classList.contains('l');
    }
    if (n.classList && n.classList.contains('pvs')) p = true;   // a closed cell's private run
    n.childNodes.forEach(c => walk(c, u, r, p));
  };
  node.childNodes.forEach(c => walk(c, null, false, false));
  return spans;
}


function lineFrom(el) {
  // work a character at a time: a link and a (( )) run can start and end
  // anywhere relative to each other, so span boundaries are re-derived
  const chars = [];
  for (const s of spansOf(el))
    for (const ch of s.t) chars.push({ch, url: s.url, rel: s.rel, priv: !!s.priv, drop: false});
  const text = chars.map(c => c.ch).join('');
  if (!text.trim()) return null;                     // blank line = paragraph gap

  const cl = el.classList || {contains: () => false};
  let bullet = cl.contains('b'), priv = cl.contains('pv'), m;
  const cut = n => { for (let i = 0; i < n; i++) chars[i].drop = true; };
  if ((m = text.match(/^\s*-\s+/))) { bullet = true; cut(m[0].length); }
  else if ((m = text.match(/^\s*\/\/\s?/))) { priv = true; cut(m[0].length); }

  // depth-counted, so ((mineralization (key))) closes in the right place
  let depth = 0, start = -1, i = 0;
  while (i < chars.length) {
    const ch = chars[i].ch;
    if (depth === 0) {
      if (ch === '(' && chars[i + 1] && chars[i + 1].ch === '(') { start = i; depth = 2; i += 2; continue; }
      i++; continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        for (let k = start; k <= i; k++) chars[k].priv = true;
        chars[start].drop = chars[start + 1].drop = chars[i - 1].drop = chars[i].drop = true;
        start = -1;
      }
    }
    i++;
  }
  if (depth > 0) {                                   // closer not typed yet
    for (let k = start; k < chars.length; k++) chars[k].priv = true;
    chars[start].drop = chars[start + 1].drop = true;
  }

  const spans = [];
  for (const c of chars) {
    if (c.drop) continue;
    const p = spans[spans.length - 1];
    if (p && p.url === c.url && p.rel === c.rel && p.priv === c.priv) p.t += c.ch;
    else spans.push({t: c.ch, url: c.url, rel: c.rel, priv: c.priv});
  }
  if (!spans.some(s => s.t.trim())) return null;
  return {bullet, private: priv, spans};
}

/* One block element can hold several lines: the browser inserts a <br> for
   shift-return, and Sheets uses them inside a table cell. Ignoring them merged
   two lines into one, which silently swallowed text behind a leading //. */
function linesOfBlock(el) {
  const groups = [[]];
  for (const n of el.childNodes) {
    if (n.nodeName === 'BR') groups.push([]);
    else groups[groups.length - 1].push(n);
  }
  if (groups.length === 2 && !groups[0].length && !groups[1].length) return [null];  // just a <br>
  return groups.map(g => {
    const d = document.createElement('div');
    if (el.className) d.className = el.className;
    g.forEach(n => d.appendChild(n.cloneNode(true)));
    return lineFrom(d);
  });
}

/* Chrome does nothing for ctrl-return, and shift-return gives a <br> inside the
   current line rather than a new one. Both are wrong here, so the split is
   done by hand: everything after the caret moves into a fresh line div. */
function newLine() {
  if (!editing) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  r.deleteContents();
  let node = r.startContainer;
  if (node.nodeType === 3) node = node.parentNode;
  const ln = node && node.closest ? node.closest('.ln') : null;
  if (!ln || !editing.contains(ln)) return;

  const tail = document.createRange();
  tail.setStart(r.startContainer, r.startOffset);
  tail.setEnd(ln, ln.childNodes.length);
  const frag = tail.extractContents();

  const next = document.createElement('div');
  next.className = 'ln';
  if (frag.childNodes.length) next.appendChild(frag);
  else next.appendChild(document.createElement('br'));
  ln.parentNode.insertBefore(next, ln.nextSibling);
  /* Splitting at the very start of a line leaves the original with no child
     nodes, and a div with nothing in it has no height and no caret position —
     so an up arrow sails straight past the blank line you just made. */
  if (!ln.childNodes.length) ln.appendChild(document.createElement('br'));
  if (!ln.childNodes.length) ln.appendChild(document.createElement('br'));

  const put = document.createRange();
  put.setStart(next, 0); put.collapse(true);
  sel.removeAllRanges(); sel.addRange(put);
}

function cellLines(cell) {
  const out = [];
  let pending = null;
  const flush = () => { if (pending) { out.push(...linesOfBlock(pending)); pending = null; } };
  for (const n of [...cell.childNodes]) {
    if (n.nodeType === 8) continue;                  // clipboard fragment markers
    if (n.nodeType === 1 && (n.nodeName === 'DIV' || n.nodeName === 'P')) {
      flush(); out.push(...linesOfBlock(n));
    } else {
      if (!pending) pending = document.createElement('div');
      pending.appendChild(n.cloneNode(true));
    }
  }
  flush();
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}

/* ---------- enter / leave ---------- */

/* A day note is a record too, held on the day rather than on a block. */
const DAY_FIELDS = {note: 'noteLines', off: 'offLines'};
const EDITABLE = '.cell.sub[data-f], .dhnote[data-f], .dhoff[data-f]';
const recOf = c => DAY_FIELDS[c.dataset.f]
  ? WEEKS[c.dataset.w].days[c.dataset.d]
  : WEEKS[c.dataset.w].days[c.dataset.d].blocks[c.dataset.bi];
const fieldOf = c => DAY_FIELDS[c.dataset.f] || c.dataset.f;

function openCell(cell) {
  if (editing === cell || student || !cell.dataset.f) return;
  closeCell();
  cell.innerHTML = editHTML(recOf(cell)[fieldOf(cell)]);
  cell.setAttribute('contenteditable', 'true');
  cell.spellcheck = true;
  editing = cell;
  if (document.activeElement !== cell) cell.focus();
}

/* Closing repaints just this cell and its block header. Rebuilding the whole
   grid here would destroy the element a pending click is travelling towards,
   which is why moving straight from one class cell to another used to fail. */
function closeCell() {
  if (!editing) return;
  endBurst();
  const cell = editing; editing = null;
  const rec = recOf(cell), f = fieldOf(cell);
  const ls = cellLines(cell);
  rec[f] = ls.length ? ls : null;
  cell.removeAttribute('contenteditable');
  cell.innerHTML = lines(rec[f]);
  if (typeof syncChange === 'function' && ls.length !== undefined) syncChange(cell, rec[f]);
  const hdr = document.querySelector('.chd[data-h="' + cell.dataset.h + '"]');
  if (hdr) {
    const tag = hdr.querySelector('.heldn');
    if (tag) tag.remove();
    hdr.insertAdjacentHTML('beforeend', heldTag(rec));
  }
  // cancelling a day changes every block in that column, and closing a cell
  // only repaints itself — so the rest of the column has to be told
  if (f === 'offLines') markCancelled(cell.dataset.w, cell.dataset.d, cell);
  hidePop();
}

/* ---------- moving between cells ----------
 *
 * Return leaves a cell; arrows then move between cells, the way tabbing round
 * a spreadsheet works. A line break inside a cell is Return held with shift,
 * ctrl or cmd — all three, so the same gesture works on a Mac and a PC without
 * having to remember which machine you are sitting at. Alt is left alone.
 */

let selKey = null;

/* An editable field is often nested inside its grid cell — the day-note and
   the school-level line both sit inside the header. Reading the position off
   the field itself gave NaN, and sorting by NaN made Tab order effectively
   random. Walk up to the grid child and read it from there. */
const gridCell = el => el.closest ? (el.closest('.grid > div') || el) : el;
const gridPos = el => {
  const g = gridCell(el);
  return {r: parseInt(g.style.gridRow, 10) || 0, c: parseInt(g.style.gridColumn, 10) || 0};
};

/* A cell that cannot be typed in is still somewhere the keyboard should reach,
   so it needs a name too. Editable ones keep their record key; the rest are
   known by where they sit. */
const cellKey = el => el.dataset.h
  ? el.dataset.h + ':' + el.dataset.f
  : 'at:' + gridPos(el).r + '.' + gridPos(el).c;

/* everything the arrows can land on: the whole grid, not just what accepts text */
const NAVIGABLE = '.grid > div';
function navCells() {
  return [...document.querySelectorAll(NAVIGABLE)]
    .filter(el => !el.classList.contains('corner'))
    .map(el => {
      const inner = el.querySelector('[data-f]');
      return {el: inner || el, ...gridPos(el)};
    });
}

function allCells() {
  return [...document.querySelectorAll(EDITABLE)]
    .map(el => ({el, ...gridPos(el)}));
}

/* A day header holds two fields; the arrows should reach both, so it counts
   twice rather than once. */
function navAll() {
  const seen = new Set(), out = [];
  for (const c of navCells()) {
    const host = gridCell(c.el);
    const fields = [...host.querySelectorAll('[data-f]')];
    if (fields.length > 1) {
      fields.forEach((f, i) => out.push({el: f, r: c.r, c: c.c, sub: i}));
    } else {
      out.push({...c, sub: 0});
    }
    seen.add(host);
  }
  return out;
}

function select(el) {
  document.querySelectorAll('.sel').forEach(n => n.classList.remove('sel'));
  if (!el) { selKey = null; return; }
  el.classList.add('sel');
  selKey = cellKey(el);
  if (el.scrollIntoView) el.scrollIntoView({block: 'nearest', inline: 'nearest'});
}

/* called by render(), which rebuilds the grid and loses the class */
function restoreSelection() {
  if (!selKey) return;
  const el = navAll().map(x => x.el).find(n => cellKey(n) === selKey);
  if (el) el.classList.add('sel'); else selKey = null;
}

function current() {
  if (editing) return editing;
  const all = navAll().map(x => x.el);
  return all.find(n => cellKey(n) === selKey) || null;
}

function move(dr, dc) {
  const from = current();
  const cells = navAll();
  if (!from) { if (cells.length) select(cells[0].el); return; }
  const here = gridPos(from);

  // two fields share the header cell, so up and down step between them first
  if (dr) {
    const sibs = cells.filter(x => x.r === here.r && x.c === here.c)
                      .sort((a, b) => (a.sub || 0) - (b.sub || 0));
    const i = sibs.findIndex(x => x.el === from);
    if (i >= 0 && sibs[i + dr]) { closeCell(); select(sibs[i + dr].el); return; }
  }

  let best = null;
  for (const cand of cells) {
    if (cand.el === from) continue;
    if (dc) {
      if (cand.r !== here.r) continue;
      if (Math.sign(cand.c - here.c) !== dc) continue;
      if (!best || Math.abs(cand.c - here.c) < Math.abs(best.c - here.c)) best = cand;
    } else {
      if (cand.c !== here.c) continue;
      if (Math.sign(cand.r - here.r) !== dr) continue;
      if (!best || Math.abs(cand.r - here.r) < Math.abs(best.r - here.r)) best = cand;
    }
  }
  if (best) { closeCell(); select(best.el); return; }
  // nothing that way: off the side of the window means slide it a day
  if (dc) { closeCell(); pageWindow(dc); }
}

/* Left or right past the outermost column moves the window a day, the same as
   the arrows in the header, and lands on the row you were already on. */
function pageWindow(dc) {
  if (typeof winStart === 'undefined') return;
  const before = winStart;
  winStart = clampStart(winStart + dc);
  if (winStart === before) return;
  const keep = current();
  const pos = keep ? gridPos(keep) : null;
  const key = keep ? cellKey(keep) : null;
  render();
  if (!pos) return;
  const row = navAll().filter(x => x.r === pos.r);
  if (!row.length) return;
  const land = dc > 0 ? row[row.length - 1] : row[0];
  select(land.el);
}

/* reading order, for tab */
/* Tab runs across the row — day to day — then wraps to the start of the next.
   Only cells that accept text, since tab is for filling things in. */
function step(dir) {
  const cells = allCells().sort((a, b) => a.r - b.r || a.c - b.c || 0);
  const from = current();
  const i = from ? cells.findIndex(x => x.el === from) : -1;
  const next = cells[(i + dir + cells.length) % cells.length];
  if (next) { closeCell(); select(next.el); }
}

/* ---------- undo ----------
 *
 * The browser's own history only covers edits made through its editing
 * commands, so anything rebuilt directly — a multi-line paste, a released
 * link — was invisible to ctrl-z. This keeps its own stack instead, so undo
 * behaves the same whatever the change was.
 */

const HIST_MAX = 200;
let past = [], future = [], burst = false, burstTimer = null;

const clone = x => JSON.parse(JSON.stringify(x || []));
const stateOf = cell =>
  clone(cell === editing ? cellLines(cell) : recOf(cell)[fieldOf(cell)]);

function snapOf(cell) {
  const d = cell.dataset;
  return {w: d.w, d: d.d, bi: d.bi, f: d.f, lines: stateOf(cell)};
}

const DAY_SUFFIX = {note: 'n', off: 'o'};
const snapSel = s => DAY_SUFFIX[s.f]
  ? '[data-f="' + s.f + '"][data-h="' + s.w + '.' + s.d + '.' + DAY_SUFFIX[s.f] + '"]'
  : '[data-f="' + s.f + '"][data-h="' + s.w + '.' + s.d + '.' + s.bi + '"]';
const snapRec = s => DAY_FIELDS[s.f] ? WEEKS[s.w].days[s.d] : WEEKS[s.w].days[s.d].blocks[s.bi];
const snapField = s => DAY_FIELDS[s.f] || s.f;

/* call immediately BEFORE changing a cell */
function mark(cell) {
  if (!cell || !cell.dataset.f) return;
  past.push(snapOf(cell));
  if (past.length > HIST_MAX) past.shift();
  future.length = 0;
}

function repaint(snap) {
  const rec = snapRec(snap), f = snapField(snap);
  rec[f] = snap.lines.length ? clone(snap.lines) : null;
  const el = document.querySelector(snapSel(snap));
  if (!el) { render(); return; }
  el.innerHTML = (el === editing) ? editHTML(rec[f]) : lines(rec[f]);
  const hdr = document.querySelector('.chd[data-h="' + el.dataset.h + '"]');
  if (hdr) {
    const tag = hdr.querySelector('.heldn');
    if (tag) tag.remove();
    hdr.insertAdjacentHTML('beforeend', heldTag(rec));
  }
}

function stepBack() {
  endBurst();
  const snap = past.pop();
  if (!snap) return;
  const el = document.querySelector(snapSel(snap));
  future.push(el ? snapOf(el) : {...snap, lines: clone(snapRec(snap)[snapField(snap)])});
  repaint(snap);
  hidePop();
}

function stepForward() {
  endBurst();
  const snap = future.pop();
  if (!snap) return;
  const el = document.querySelector(snapSel(snap));
  past.push(el ? snapOf(el) : {...snap, lines: clone(snapRec(snap)[snapField(snap)])});
  repaint(snap);
  hidePop();
}

/* a run of typing collapses into one undo step */
function endBurst() { burst = false; clearTimeout(burstTimer); burstTimer = null; }
function typingBurst(cell) {
  if (!burst) { mark(cell); burst = true; }
  clearTimeout(burstTimer);
  burstTimer = setTimeout(endBurst, 700);
}

/** put or clear the cancelled marks down one day's column */
function markCancelled(w, d, field) {
  const day = WEEKS[w].days[d];
  const off = typeof isCancelled === 'function' && isCancelled(day);
  if (field) field.classList.toggle('cancelled', off);
  const why = off ? offText(day) : '';
  document.querySelectorAll('.chd[data-h^="' + w + '.' + d + '."]').forEach(hdr => {
    const old = hdr.querySelector('.cxl');
    if (old) old.remove();
    if (off) hdr.insertAdjacentHTML('beforeend', '<span class="cxl">' + esc(why) + '</span>');
  });
}

/* ---------- link menu ---------- */

const ICON = {
  copy: '<svg viewBox="0 0 16 16"><rect x="5" y="5" width="9.4" height="9.4" rx="1.5"/>' +
        '<path d="M11 3.6V2.6A1.6 1.6 0 0 0 9.4 1H2.6A1.6 1.6 0 0 0 1 2.6v6.8A1.6 1.6 0 0 0 2.6 11h1"/></svg>',
  edit: '<svg viewBox="0 0 16 16"><path d="M11.8 2.2l2 2-7.6 7.6L3 12.8l1-3.2z"/><path d="M2 14.6h12"/></svg>',
  unlink: '<svg class="w2" viewBox="0 0 24 24">' +
          '<path d="M18.84 12.25l1.72-1.71a4.24 4.24 0 0 0-6-6l-1.72 1.71"/>' +
          '<path d="M5.17 11.75l-1.71 1.71a4.24 4.24 0 0 0 6 6l1.71-1.71"/>' +
          '<path d="M8 2v3M2 8h3M16 22v-3M22 16h-3"/></svg>',
  open: '<svg viewBox="0 0 16 16"><path d="M13 9.2v4.2A1.6 1.6 0 0 1 11.4 15H2.6A1.6 1.6 0 0 1 1 13.4V4.6A1.6 1.6 0 0 1 2.6 3h4.2"/>' +
        '<path d="M10 1h5v5"/><path d="M15 1L7.6 8.4"/></svg>',
  shown: '<svg viewBox="0 0 16 16"><path d="M1 8s2.6-4.6 7-4.6S15 8 15 8s-2.6 4.6-7 4.6S1 8 1 8z"/>' +
         '<circle cx="8" cy="8" r="2.1"/></svg>',
  hidden: '<svg viewBox="0 0 16 16"><path d="M2 2l12 12"/>' +
          '<path d="M6.2 3.8A7.6 7.6 0 0 1 8 3.4C12.4 3.4 15 8 15 8a12 12 0 0 1-2.5 3"/>' +
          '<path d="M4.3 5.2A11.9 11.9 0 0 0 1 8s2.6 4.6 7 4.6a7.4 7.4 0 0 0 2.4-.4"/></svg>'
};

const pop = () => document.getElementById('pop');
let popFor = null;

function showPop(a) {
  const p = pop();
  popFor = a;
  const rel = a.dataset.r === '1';
  p.classList.remove('editing');
  p.innerHTML =
    '<div class="row">' +
    '<button data-act="copy" title="Copy link">' + ICON.copy + '</button>' +
    '<button data-act="edit" title="Edit link">' + ICON.edit + '</button>' +
    '<button data-act="unlink" title="Remove link">' + ICON.unlink + '</button>' +
    '<button data-act="rel" title="' + (rel ? 'Hold back from students' : 'Release to students') + '">' +
      (rel ? ICON.shown : ICON.hidden) + '</button>' +
    '<button data-act="open" title="Open">' + ICON.open + '</button>' +
    '</div><div class="ed">' +
    '<input class="tx" type="text" spellcheck="false">' +
    '<input class="ur" type="url" spellcheck="false">' +
    '<button data-act="save">Save</button></div>';
  const box = a.getBoundingClientRect();
  p.classList.add('on');
  p.style.top = (window.scrollY + box.bottom + 6) + 'px';
  p.style.left = Math.min(window.scrollX + box.left,
    window.scrollX + document.documentElement.clientWidth - p.offsetWidth - 8) + 'px';
}
function hidePop() { pop().classList.remove('on', 'editing'); popFor = null; }

/* Scripted DOM edits never enter the browser's undo stack, so a broken link
   couldn't be brought back with ctrl-z. Routing every change through
   execCommand puts it on the stack like any other typing. */
function anchorHTML(url, rel, text, tag) {
  return '<a class="' + (rel ? 'l' : 'h') + '"' + (tag ? ' id="__newlink"' : '') +
         ' data-u="' + esc(url) + '" data-r="' + (rel ? 1 : 0) + '">' +
         (esc(text) || '&nbsp;') + '</a>';
}
/* Park the caret just outside a link. Left at the end of the anchor, the next
   thing typed is swallowed into it and there is no way back out. */
/**
 * Clicking at the visual end of a link leaves the caret inside the anchor, on
 * its last character — so the next thing typed becomes part of the link even
 * though there is a slot waiting just outside. Catch it before the character
 * lands and step over the edge first.
 */
function leaveLinkEdge() {
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return;
  const r = sel.getRangeAt(0);
  const node = r.startContainer;
  const host = node.nodeType === 3 ? node.parentNode : node;
  const a = host && host.closest ? host.closest('a[data-u]') : null;
  if (!a || !editing.contains(a)) return;
  const atEnd = node.nodeType === 3
    ? (r.startOffset === node.nodeValue.length && !node.nextSibling && a.contains(node))
    : r.startOffset === node.childNodes.length;
  if (atEnd) caretAfter(a);
}

function caretAfter(node) {
  if (editing) editing.focus();
  if (!node || !node.parentNode) return;
  let next = node.nextSibling;
  if (!next || next.nodeType !== 3) {
    next = document.createTextNode('\u200B');
    node.parentNode.insertBefore(next, node.nextSibling);
  }
  const r = document.createRange();
  r.setStart(next, Math.min(1, next.nodeValue.length));
  r.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges(); sel.addRange(r);
}

/**
 * Swap an anchor for something else, by hand.
 *
 * This used to go through execCommand('insertHTML') so the browser would record
 * it for undo. Undo is ours now, so that bought nothing — and execCommand fails
 * silently depending on where focus happens to be, which is what kept the
 * unlink button looking dead. A direct replacement always works.
 */
function replaceAnchor(a, html) {
  const parent = a.parentNode;
  if (!parent) return null;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const added = [...tpl.content.childNodes];
  added.forEach(n => parent.insertBefore(n, a));
  parent.removeChild(a);

  const fresh = added.find(n => n.id === '__newlink') || null;
  if (fresh) fresh.removeAttribute('id');
  const anchor = fresh || added[added.length - 1];
  if (anchor && anchor.parentNode) caretAfter(anchor);
  return fresh;
}

/* Multi-line paste. Inserting block elements at a caret that sits inside a
   line div does not reliably split that block, so everything lands on one
   line. Merge into the model and repaint instead — deterministic, at the cost
   of this one operation not sitting on the undo stack. */
function pasteLines(cell, ls) {
  if (!ls.length) return;
  const cur = cellLines(cell);
  const sel = window.getSelection();

  let idx = cur.length - 1;
  if (sel.rangeCount) {
    let n = sel.getRangeAt(0).startContainer;
    if (n.nodeType === 3) n = n.parentNode;
    const lnEl = n && n.closest ? n.closest('.ln') : null;
    if (lnEl && lnEl.parentNode === cell) idx = [...cell.children].indexOf(lnEl);
  }

  const out = cur.slice();
  const at = Math.max(0, Math.min(idx, out.length - 1));
  let lastIdx;
  if (!out.length || !out[at]) { out.splice(at, out.length ? 1 : 0, ...ls); lastIdx = at + ls.length - 1; }
  else { out.splice(at + 1, 0, ...ls); lastIdx = at + ls.length; }

  cell.innerHTML = editHTML(out);
  const el = cell.children[Math.min(lastIdx, cell.children.length - 1)];
  if (el) {
    const r = document.createRange();
    r.selectNodeContents(el); r.collapse(false);
    sel.removeAllRanges(); sel.addRange(r);
  }
}

/** fill in a pasted link's label once the endpoint reports the document name */
function nameFromDrive(anchor, url) {
  if (typeof linkTitle !== 'function') return;
  linkTitle(url).then(name => {
    if (!name || !anchor.parentNode) return;
    if (anchor.textContent !== url) return;          // already renamed by hand
    anchor.textContent = name;
    const box = pop();
    const tx = box.querySelector('.tx');
    if (tx && popFor === anchor && tx.value === url) { tx.value = name; tx.select(); }
  });
}

function saveLink() {
  const p = pop();
  if (!popFor) return;
  endBurst(); mark(editing);
  const text = p.querySelector('.tx').value;
  const url = p.querySelector('.ur').value.trim();
  const ok = /^https?:\/\/\S+$/i.test(url);
  const fresh = replaceAnchor(popFor, anchorHTML(ok ? url : popFor.dataset.u,
    popFor.dataset.r === '1', text || popFor.textContent, true));
  hidePop();
  if (fresh) caretAfter(fresh);
}

/* writeText rejects rather than throwing when the browser refuses — a plain
   try/catch never sees it, so the fallback has to hang off .catch(). */
function copyText(t, done) {
  const viaTextarea = () => {
    const sel = window.getSelection();
    const keep = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove();
    if (editing) editing.focus();
    if (keep) { sel.removeAllRanges(); sel.addRange(keep); }
    done(ok);
  };
  let p = null;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) p = navigator.clipboard.writeText(t);
  } catch (err) { p = null; }
  if (p && p.then) p.then(() => done(true)).catch(viaTextarea);
  else viaTextarea();
}

/* brief confirmation, so a copy that worked doesn't look like one that didn't */
function flashPop(msg) {
  const p = pop();
  p.innerHTML = '<div class="flash">' + esc(msg) + '</div>';
  p.classList.add('on');
  setTimeout(() => { if (p.querySelector('.flash')) hidePop(); }, 1100);
}

/* ---------- wiring ---------- */

function wireEditor() {
  const main = document.getElementById('app');

  /* Clicking a link opens the cell like any other click. Following a link is
     the menu's job — otherwise a cell full of links is barely clickable. */
  main.addEventListener('mousedown', e => {
    const cell = e.target.closest(EDITABLE);
    const a = e.target.closest('a[data-u]');
    if (!cell) { closeCell(); select(null); return; }
    select(cell);
    if (cell === editing) return;
    const hit = a ? [...cell.querySelectorAll('a[data-u]')].indexOf(a) : -1;
    closeCell();
    openCell(cell);
    if (hit >= 0 && editing) {
      const fresh = editing.querySelectorAll('a[data-u]')[hit];
      if (fresh) { e.preventDefault(); showPop(fresh); }
    }
  });

  main.addEventListener('click', e => {
    const a = e.target.closest('a[data-u]');
    if (!a) return;
    e.preventDefault();
    // In the student preview a link is just a link — there is no cell to open,
    // so it opens the way it will for them. In the teacher view a click opens
    // the cell instead, or a cell full of links is barely clickable.
    if (student) { window.open(a.dataset.u, '_blank', 'noopener'); return; }
    if (editing && editing.contains(a)) showPop(a);
  });

  /* typing is captured before it lands, so the snapshot is the state prior */
  main.addEventListener('beforeinput', e => {
    if (!editing) return;
    if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
      e.preventDefault();                            // undo is ours, not the browser's
      return;
    }
    if (e.inputType && e.inputType.indexOf('insert') === 0) leaveLinkEdge();
    typingBurst(editing);
  });

  /* Undo is ours, so it must pre-empt the browser's — otherwise both fire and
     a single ctrl-z walks back two steps. */
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (!(e.metaKey || e.ctrlKey) || (k !== 'z' && k !== 'y')) return;
    if (e.target.tagName === 'INPUT') return;         // the link panel's own fields
    e.preventDefault();
    if (k === 'y' || e.shiftKey) stepForward(); else stepBack();
  }, true);

  /* navigation, and the return/modifier-return split */
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const mod = e.shiftKey || e.ctrlKey || e.metaKey;

    if (e.key === 'Enter') {
      if (mod) {                                     // shift/ctrl/cmd: a real new line
        if (!editing) return;
        e.preventDefault();
        typingBurst(editing);
        newLine();
        return;
      }
      e.preventDefault();
      if (editing) { const c = editing; closeCell(); select(c); }
      else { const c = current(); if (c) openCell(c); }
      return;
    }
    if (e.key === 'Tab' && !editing) { e.preventDefault(); step(e.shiftKey ? -1 : 1); return; }
    if (editing) return;                             // arrows edit text while a cell is open
    const nav = {ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0]}[e.key];
    if (nav) { e.preventDefault(); move(nav[0], nav[1]); }
  });

  /* a new line arrives as a bare div; give it the class the rest of them have */
  main.addEventListener('input', () => {
    if (!editing) return;
    for (const n of editing.children) if (n.nodeName === 'DIV') n.classList.add('ln');
  });

  main.addEventListener('keydown', e => {
    if (!editing) return;
    if (e.key === 'Escape') { e.preventDefault(); closeCell(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();                            // select this cell, not the page
      const r = document.createRange();
      r.selectNodeContents(editing);
      const s = window.getSelection();
      s.removeAllRanges(); s.addRange(r);
    }
  });

  /* Paste. A bare URL links the selected words, or drops in as its own label.
     Anything else arrives as plain text split back into lines, so returns and
     "- " bullets survive a copy from another cell. */
  main.addEventListener('paste', e => {
    if (!editing) return;
    const raw = e.clipboardData.getData('text/plain') || '';
    const t = raw.trim();
    endBurst(); mark(editing);
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    e.preventDefault();

    if (/^https?:\/\/\S+$/i.test(t)) {
      // note this before inserting: the insert mutates the range we are holding
      const bare = range.collapsed;
      const label = bare ? t : sel.toString();
      document.execCommand('insertHTML', false, anchorHTML(t, false, label, true));
      const fresh = document.getElementById('__newlink');
      if (fresh) {
        fresh.removeAttribute('id');
        caretAfter(fresh);
        showPop(fresh);
        // pasted on its own the label is the raw address, so ask Drive what the
        // document is called and drop the name in when it answers. The panel
        // opens straight away either way — waiting on a round trip to start
        // typing would be worse than a label that improves a moment later.
        if (bare) {
          pop().querySelector('[data-act=edit]').click();
          nameFromDrive(fresh, t);
        }
      }
      return;
    }

    /* Prefer the clipboard's HTML so links, bullets and blank lines survive a
       copy between cells. It goes through our own model on the way in, which
       also strips anything foreign pasted from elsewhere. */
    insertClip(e.clipboardData.getData('text/html'), raw, range);
  });

  wireLinkMenu();
  wireClipboard();
}

/* Sheets keeps a cell's line breaks as real newline characters and shows them
   with white-space:pre-wrap, rather than as <br>. Either way they are line
   breaks, so turn them into <br> before the content is read. */
function normalizeBreaks(root) {
  const texts = [];
  const walk = n => {
    if (n.nodeType === 3) { if (n.nodeValue.indexOf('\n') >= 0) texts.push(n); return; }
    for (const c of [...n.childNodes]) walk(c);
  };
  walk(root);
  for (const t of texts) {
    const parts = t.nodeValue.replace(/\r\n?/g, '\n').split('\n');
    const frag = document.createDocumentFragment();
    parts.forEach((p, i) => {
      if (i) frag.appendChild(document.createElement('br'));
      if (p) frag.appendChild(document.createTextNode(p));
    });
    t.parentNode.replaceChild(frag, t);
  }
  return root;
}

/* Sheets nests its line breaks inside spans, and sometimes inside the <a>
   itself. Splitting only on direct children missed every one of them, so a
   whole cell arrived as a single line. Recurse, cloning each wrapper so a link
   broken across a line stays a link on both sides. */
function splitBr(node) {
  const out = [document.createDocumentFragment()];
  for (const child of node.childNodes) {
    if (child.nodeName === 'BR') { out.push(document.createDocumentFragment()); continue; }
    if (child.nodeType === 1 && child.querySelector && child.querySelector('br')) {
      const parts = splitBr(child);
      parts.forEach((p, i) => {
        if (i) out.push(document.createDocumentFragment());
        const shell = child.cloneNode(false);        // keeps href, class, style
        shell.appendChild(p);
        out[out.length - 1].appendChild(shell);
      });
      continue;
    }
    if (child.nodeType === 8) continue;
    out[out.length - 1].appendChild(child.cloneNode(true));
  }
  return out;
}

/* Pasted from the spreadsheet, a released link still carries the '*' marker
   that Publish.gs reads. Honour it once on the way in and drop the character —
   after that the release flag is the record, and the marker never comes back. */
function applyStars(ls) {
  for (const l of ls) {
    if (!l) continue;
    for (let i = 0; i < l.spans.length; i++) {
      const s = l.spans[i];
      if (!s.url || s.rel) continue;
      if (s.t.charAt(0) === '*') { s.t = s.t.slice(1); s.rel = true; continue; }
      const prev = l.spans[i - 1];
      if (prev && !prev.url) {
        const m = prev.t.match(/\*[ \t]*$/);
        if (m) { prev.t = prev.t.slice(0, -m[0].length); s.rel = true; }
      }
    }
    l.spans = l.spans.filter(s => s.t.length);
  }
  return ls.filter(l => !l || l.spans.length);
}

function insertClip(clip, raw, range) {
  if (!editing) return;
  const sel = window.getSelection();
  if (!range) {
    if (!sel.rangeCount) {
      const r = document.createRange();
      r.selectNodeContents(editing); r.collapse(false);
      sel.removeAllRanges(); sel.addRange(r);
    }
    range = sel.getRangeAt(0);
  }
    let ls;
    if (clip) {
      const box = document.createElement('div');
      box.innerHTML = clip;
      // strip the wrapper the browser adds around a copied fragment
      box.querySelectorAll('meta,style,script,title').forEach(n => n.remove());
      const own = box.querySelector('[data-f]') || box.querySelector('.ln');
      if (own) {
        // NOT normalizeBreaks: our own markup puts every line in its own div,
        // so the only newlines here are the ones the browser leaves between
        // elements in the clipboard wrapper — turning those into breaks is
        // what put three blank lines at the top of every pasted cell
        ls = cellLines(box.querySelector('[data-f]') || box);
      } else {
        normalizeBreaks(box);
        // a multi-cell copy comes as a table; a single cell does not
        const src = box.querySelector('td') || box;
        ls = splitBr(src).map(f => {
          const d = document.createElement('div');
          d.appendChild(f);
          return lineFrom(d);
        });
        ls = applyStars(ls);
      }
      // the wrapper the browser adds carries blank lines of its own, whichever
      // branch produced them
      while (ls.length && ls[ls.length - 1] === null) ls.pop();
      while (ls.length && ls[0] === null) ls.shift();
    } else {
      const holder = document.createElement('div');
      (raw || '').replace(/\r\n?/g, '\n').split('\n').forEach(line => {
        const d = document.createElement('div');
        d.className = 'ln';
        if (line) d.textContent = line; else d.appendChild(document.createElement('br'));
        holder.appendChild(d);
      });
      ls = cellLines(holder);
    }

    if (ls.length <= 1) {                            // one line: keep it undoable
      document.execCommand('insertHTML', false,
        ls.length ? editHTML(ls).replace(/^<div class="ln">|<\/div>$/g, '') : '');
    } else {
      range.deleteContents();
      pasteLines(editing, ls);
    }
}

function wireLinkMenu() {
  const p = pop();
  p.addEventListener('mousedown', e => {
    if (e.target.tagName !== 'INPUT') e.preventDefault();      // keep the cell focused
  });
  /* Enter commits from either field, Escape backs out. */
  p.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); saveLink(); }
    else if (e.key === 'Escape') {
      e.preventDefault();
      hidePop();
      if (editing) editing.focus();
    }
  });
  p.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn || !popFor) return;
    const act = btn.dataset.act;
    if (act === 'open') { window.open(popFor.dataset.u, '_blank', 'noopener'); return; }
    if (act === 'copy') {
      copyText(popFor.dataset.u, ok => flashPop(ok ? 'Link copied' : 'Copy blocked by the browser'));
      return;
    }
    if (act === 'rel') {
      endBurst(); mark(editing);
      const on = popFor.dataset.r === '1';
      const fresh = replaceAnchor(popFor,
        anchorHTML(popFor.dataset.u, !on, popFor.textContent, true));
      if (fresh) showPop(fresh); else hidePop();
      return;
    }
    if (act === 'edit') {
      p.classList.add('editing');
      p.querySelector('.tx').value = popFor.textContent;
      p.querySelector('.ur').value = popFor.dataset.u;
      const t = p.querySelector('.tx');
      t.focus(); t.select();
      return;
    }
    if (act === 'save') { saveLink(); return; }
    if (act === 'unlink') {
      endBurst(); mark(editing);
      replaceAnchor(popFor, esc(popFor.textContent));
      hidePop();
    }
  });

  /* Capture phase on purpose. Opening a cell replaces its innerHTML, which
     orphans the clicked node — by the bubble phase it is no longer inside
     #app, and this would close the cell that was just opened. */
  document.addEventListener('mousedown', e => {
    if (e.target.closest('#pop') || e.target.closest('#app')) return;
    closeCell();
  }, true);

}


/* Copy and cut on ctrl or cmd, so the same keys work on a Mac and a PC. Alt is
   deliberately left alone — option-c/x/v type ç, ≈ and √ on a Mac. */
function wireClipboard() {
  document.addEventListener('keydown', e => {
    if (e.shiftKey || e.altKey || !(e.ctrlKey || e.metaKey)) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (k !== 'c' && k !== 'x' && k !== 'v') return;
    const cell = current();
    if (!cell) return;

    /* Paste is never intercepted. A page cannot start one, so blocking the key
       would stop the only thing that can. Just make sure a cell is open and the
       browser's own paste event lands in it. */
    if (k === 'v') { if (!editing) openCell(cell); return; }

    e.preventDefault();
    const sel = window.getSelection();
    if (!editing || sel.isCollapsed) {              // nothing selected: take the whole cell
      openCell(cell);
      const r = document.createRange();
      r.selectNodeContents(cell);
      sel.removeAllRanges(); sel.addRange(r);
    }
    if (k === 'x') { endBurst(); mark(editing); }
    document.execCommand(k === 'x' ? 'cut' : 'copy');
  });
}


