/* The student agenda.
 *
 * Renders whatever the endpoint publishes and nothing else. There is no
 * filtering here on purpose: held links arrive with no url and private notes
 * never arrive at all, because a page can be read by anyone who opens it.
 *
 * A span becomes a link only if it carries a url. Text alone stays text.
 */

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let staff = false;                     // a colleague's link, not a student's
let jumped = false;                    // only ever scroll on the first load

/** the last week that has started, or the first one if the year has not */
function goToCurrentWeek(today) {
  const secs = [...document.querySelectorAll('.week[data-mon]')];
  if (!secs.length) return;
  const now = today || new Date().toISOString().slice(0, 10);
  let target = secs[0];
  for (const s of secs) if (s.dataset.mon <= now) target = s;
  if (target !== secs[0] && target.scrollIntoView) target.scrollIntoView({block: 'start'});
  target.classList.add('here');
}

function spanHTML(s) {
  if (s.priv && !staff) return '';                  // same reasoning as above
  const t = esc(s.t);
  if (s.url && !staff && s.rel === false) return t; // a held link is words only
  if (s.url) {
    // on a colleague's link an unreleased link is still a working one, marked
    // so they can see it is not out yet
    const cls = (staff && !s.rel) ? ' class="held"' : '';
    return `<a${cls} href="${esc(s.url)}" target="_blank" rel="noopener">${t}</a>`;
  }
  // held back: shown the way it looks in the planner's own student view, so a
  // student can see something is coming. Never a link, and no address exists
  // in this payload to make one from.
  if (s.held) return `<span class="held">${t}</span>`;
  return t;
}

function linesHTML(ls) {
  if (!ls || !ls.length) return '';
  return ls.map(l => {
    if (!l) return '<div class="gap"></div>';
    // the endpoint already strips these; refusing them here too means a bug
    // upstream cannot put a private note in front of a student
    if (l.private && !staff) return '';
    const cls = 'ln' + (l.bullet ? ' b' : '') + (staff && l.private ? ' pv' : '');
    return `<p class="${cls}">` + l.spans.map(spanHTML).join('') + '</p>';
  }).join('');
}

function field(name, ls) {
  if (!ls || !ls.length) return '';
  return `<div class="fld"><h4>${name}</h4>${linesHTML(ls)}</div>`;
}

/* One row per meeting: date, block, class work, homework — side by side on a
   Chromebook, stacked only when the screen is too narrow for two columns. */
function dayHTML(d, stripe) {
  const z = stripe ? ' alt' : '';
  const note = (staff && d.note) ? `<div class="daynote">${esc(d.note)}</div>` : '';
  // a school day this class simply does not fall on — not the same as no school
  if (d.nomeet) {
    return `<div class="row off nm${z}"><div class="when">${esc(d.d)}</div>` +
           `<div class="blk"></div><div class="note nomeet">No class today${note}</div></div>`;
  }
  if (d.off) {
    return `<div class="row off${z}"><div class="when">${esc(d.d)}</div>` +
           `<div class="blk"></div><div class="note" role="note">${esc(d.off)}${note}</div></div>`;
  }
  const meets = (d.meets || []).filter(m => m.cw || m.hw);
  if (!meets.length) return '';         // met, nothing posted: say nothing
  return meets.map((m, i) =>
    `<div class="row${z}">` +
      `<div class="when">${i ? '' : esc(d.d) + note}</div>` +
      `<div class="blk">${esc(m.block || '')}</div>` +
      `<div class="col">${field('Class work', m.cw)}</div>` +
      `<div class="col">${field('Homework', m.hw)}</div>` +
    '</div>').join('');
}

function linkBar(links) {
  if (!links || !links.length) return '';
  return '<nav class="bar">' + links.map(l =>
    `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`
  ).join('') + '</nav>';
}

function render(data) {
  const app = document.getElementById('app');
  staff = !!data.staff;
  document.body.classList.toggle('staffview', staff);
  const c = data.course;
  // period, not section — students know their class by the period they have it
  const heading = c ? (c.tag ? c.tag + ' \u00b7 ' : '') + c.name : 'Class agenda';
  document.title = c ? heading + ' Agenda' : 'Class agenda';
  if (c && c.fill) document.documentElement.style.setProperty('--accent', c.ink || '#1B3A5C');

  const stamp = data.updated
    ? 'Updated ' + new Date(data.updated).toLocaleString(undefined,
        {weekday: 'short', month: 'short', day: 'numeric',
         hour: 'numeric', minute: '2-digit'})
    : '';

  const weeks = (data.weeks || [])
    .map(w => {
      let stripe = 0;
      const days = (w.days || []).map(d => {
        const html = dayHTML(d, stripe);
        if (html) stripe = 1 - stripe;            // shade by day, not by row
        return html;
      }).join('');
      // the class name, the dates and when it was last updated all live in the
      // bar — there is no separate page header to take up a Chromebook's screen
      // dates over the updated time on one side, the class name on the other,
      // centred against both — a flex row so the centring cannot come adrift
      // an anchor per week, so the page can jump to the one in progress
      const wid = 'w' + (w.mon || '').replace(/-/g, '');
      return days ? `<section class="week" id="${wid}" data-mon="${esc(w.mon || '')}"><h2>` +
        '<span class="when2">' +
          `<span class="dates">${esc(w.label)}</span>` +
          (stamp ? `<span class="upd">${esc(stamp)}</span>` : '') +
        '</span>' +
        `<span class="cls">${esc(heading)}</span>` +
        `</h2>${days}</section>` : '';
    })
    .filter(Boolean);

  app.innerHTML =
    (staff ? '<p class="staffnote">Staff view \u2014 the whole year, unreleased ' +
             'links and notes included. Not for students.</p>' : '') +
    linkBar(data.links) +
    (weeks.length ? weeks.join('') : '<p class="msg">Nothing posted yet.</p>');

  // the year runs forward for staff, so start them at the week in progress
  // rather than at the top of August
  if (staff && !jumped) { jumped = true; goToCurrentWeek(data.today); }
}

function fail(msg) {
  document.getElementById('app').innerHTML = '<p class="msg">' + esc(msg) + '</p>';
}

let lastUpdated = null;
let tag = '', key = '';

/* Where the plan comes from, fastest first.
   1. what this browser saw last time — drawn immediately, no network at all
   2. feed/p1.json on the CDN, same origin as this page
   3. the endpoint, which has to wake up first
   A colleague link always goes straight to the endpoint: the static feed is
   the student one and carries none of my notes. */
const cacheKey = () => 'agenda.' + tag;

function drawFromCache() {
  try {
    const raw = localStorage.getItem(cacheKey());
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !data.ok) return false;
    lastUpdated = data.updated;
    render(data);
    return true;
  } catch (err) { return false; }
}

function keep(data) {
  try { localStorage.setItem(cacheKey(), JSON.stringify(data)); } catch (err) { /* full or off */ }
}

async function load(quiet) {
  try {
    // the page shell started this before agenda.js had even arrived
    if (!quiet && window.__feed) {
      const first = window.__feed;
      window.__feed = null;
      try {
        const data = await first;
        if (data && data.ok) { lastUpdated = data.updated; render(data); return; }
      } catch (err) { /* fall through and ask again properly */ }
    }
    // the cache-buster matters: Google caches these replies, and a stale one
    // would show yesterday's plan with no sign that it was old
    /* The cache-buster is now per-minute rather than per-millisecond. It still
       defeats a stale reply held for hours, which is why it exists, but two
       students opening the page in the same minute can share one answer
       instead of each waking the endpoint from scratch. */
    const bust = Math.floor(Date.now() / 60000);
    const url = key
      ? ENDPOINT + '?class=' + tag + '&k=' + encodeURIComponent(key) + '&t=' + bust
      : 'feed/' + tag + '.json?t=' + bust;
    let res;
    try {
      res = await fetch(url);
    } catch (err) {
      // the network, or the address in endpoint.js — not the page's own doing
      if (!quiet) fail('Could not reach the agenda. ' + err.message);
      return;
    }
    if (!res.ok) {
      // the static feed may not be published yet; the endpoint always works
      if (!key && res.status === 404) return loadFromEndpoint(quiet);
      if (!quiet) fail('The agenda replied ' + res.status + '.');
      return;
    }

    let data;
    try {
      data = await res.json();
    } catch (err) {
      if (!quiet) fail('The agenda sent something unreadable. It may need publishing again.');
      return;
    }
    if (!data.ok) { if (!quiet) fail(data.error || 'Could not load the agenda.'); return; }
    if (quiet && data.updated === lastUpdated) return;    // nothing new
    lastUpdated = data.updated;
    if (!key) keep(data);                                // students only
    render(data);
  } catch (err) {
    // a fault in the page itself must not read as "the network is down"
    console.error(err);
    if (!quiet) fail('The agenda could not be drawn: ' + err.message);
  }
}

/** the slow road, used when the static feed is missing */
async function loadFromEndpoint(quiet) {
  try {
    const res = await fetch(ENDPOINT + '?class=' + tag + '&t=' + Math.floor(Date.now() / 60000));
    const data = await res.json();
    if (!data.ok) { if (!quiet) fail(data.error || 'Could not load the agenda.'); return; }
    lastUpdated = data.updated;
    keep(data);
    render(data);
  } catch (err) {
    if (!quiet) fail('Could not reach the agenda. ' + err.message);
  }
}

/* A Chromebook tab sits open for days. Left alone, a student would be reading
   Monday's plan on Thursday with nothing to say it was stale — so this checks
   for itself, and always when the tab comes back to the front. */
function watch() {
  setInterval(() => { if (!document.hidden) load(true); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });
  window.addEventListener('online', () => load(true));
}

function start() {
  const q = new URLSearchParams(location.search);
  tag = (q.get('class') || '').toLowerCase();
  key = q.get('k') || '';
  if (!/^p[1-7]$/.test(tag)) { fail('Add a class to the address, like ?class=p1'); return; }
  // something on screen before the network is asked anything
  const hadCache = !key && drawFromCache();
  load(hadCache);
  watch();
}

if (typeof document !== 'undefined' && document.getElementById('app')) start();
if (typeof module !== 'undefined') module.exports = {render, linesHTML, spanHTML, dayHTML};
