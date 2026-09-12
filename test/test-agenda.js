/* The student page, rendered against the real feed captured from the endpoint.
   What matters here is what it CANNOT do: turn text into a link. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('agenda/index.html', 'utf8').replace(/<script[^>]*><\/script>/g, '');
const dom = new JSDOM(html, {url: 'https://x.test/agenda/?class=p1'});
global.window = dom.window; global.document = dom.window.document;
global.ENDPOINT = 'https://x.test/exec';
const feed = JSON.parse(fs.readFileSync('test/p1-feed.json', 'utf8'));

const src = fs.readFileSync('agenda/agenda.js', 'utf8');
eval(src.replace(/^if \(typeof document.*$/m, '').replace(/^if \(typeof module.*$/m, ''));

render(feed);
const out = document.getElementById('app').innerHTML;

const bar = document.querySelector('.week>h2');
console.log('class in the bar :', bar.querySelector('.cls').textContent);
console.log('dates next to it :', bar.querySelector('.dates').textContent);
console.log('updated below    :', bar.querySelector('.upd').textContent);
console.log('no page header   :', !document.querySelector('header'));
console.log('tab title        :', document.title);
console.log('weeks      :', document.querySelectorAll('.week').length);
console.log('rows shown :', document.querySelectorAll('.row').length,
            '(off days:', document.querySelectorAll('.row.off').length + ')');
console.log('columns    :', document.querySelectorAll('.row .col').length, 'content cells');
console.log('quick links:', document.querySelectorAll('.bar a').length);
console.log('striped    :', document.querySelectorAll('.row.alt').length, 'shaded rows');
console.log('');

const links = [...document.querySelectorAll('a')];
console.log('links rendered      :', links.length);
console.log('every link has a url:', links.every(a => /^https?:/.test(a.getAttribute('href'))));
console.log('all open in a new tab:', links.every(a => a.target === '_blank'));

// the one that matters: a span with no url must never become an anchor
const feedSpans = feed.weeks.flatMap(w => w.days).flatMap(d => d.meets || [])
  .flatMap(m => [m.cw, m.hw]).filter(Boolean).flat().filter(Boolean).flatMap(l => l.spans);
const held = feedSpans.filter(s => !s.url && s.t.trim());
const linkTexts = links.map(a => a.textContent);
console.log('held spans in feed  :', held.length);
console.log('none became links   :', held.every(s => !linkTexts.includes(s.t)));
console.log('held text still shown:', out.includes('00.QUIZ.1'));
console.log('  and it is not a link:', !/00\.QUIZ\.1[^<]*<\/a>/.test(out) &&
            !links.some(a => a.textContent.includes('00.QUIZ.1')));

console.log('');
const heldEls = [...document.querySelectorAll('.held')];
console.log('held spans marked   :', heldEls.length, heldEls.map(e => e.textContent.slice(0,12)));
console.log('  still not links   :', heldEls.every(e => e.tagName !== 'A' && !e.closest('a')));
console.log('  and carry no url  :', !heldEls.some(e => e.outerHTML.includes('http')));
const css = fs.readFileSync('agenda/agenda.css', 'utf8');
console.log('links are styled    :', /(^|\n)a\{[^}]*text-decoration:underline/.test(css));
console.log('held style present  :', /\.held\{[^}]*underline dotted/.test(css));

console.log('bullets kept        :', document.querySelectorAll('.ln.b').length);
// the GitHub page must agree with the served one
feed.weeks[0].days.push({d: 'Tue Sep 1', iso: '2026-09-01', meets: [], nomeet: 1});
feed.weeks[0].days.push({d: 'Thu Sep 3', iso: '2026-09-03', meets: []});
render(feed);
const g = document.getElementById('app').innerHTML;
console.log('no-class row shown  :', /No class today/.test(g));
console.log('  marked as ordinary:', /row off nm/.test(g));
console.log('unwritten day hidden:', !/Thu Sep 3/.test(g));
console.log('blank lines kept    :', document.querySelectorAll('.gap').length);
console.log('off day reason shown:', /Staff Day/.test(out));
console.log('date and block present:', /class="when">Wed Sep 2/.test(out) && /class="blk">Block 1/.test(out));
console.log('no teacher markup   :', !out.includes('pvs') && !out.includes('pend') &&
            !out.includes('data-u') && !out.includes('Absent'));

// a malicious or accidental angle bracket in a plan must not become markup
const nasty = {course: null, updated: '', weeks: [{label: 'W', mon: '2026-01-05', days: [
  {d: 'Mon', iso: '2026-01-05', meets: [{block: 'B', cw: [
    {bullet: false, spans: [{t: '<img src=x onerror=alert(1)>'}]}], hw: null}]}]}]};
render(nasty);
const esc2 = document.getElementById('app').innerHTML;
console.log('');
console.log('html in a plan is escaped:', !esc2.includes('<img') && esc2.includes('&lt;img'));
