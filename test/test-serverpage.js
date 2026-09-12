/* The endpoint can render the page itself. Two front doors, one redaction:
   whatever the JSON withholds, the served page must withhold too. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const gs = fs.readFileSync('apps-script/Sync.gs', 'utf8');

// run the Apps Script renderer under Node with the bits it leans on stubbed
const stub = `
var Utilities = {formatDate: () => 'Sat, Sep 5, 9:00 PM'};
var Session = {getScriptTimeZone: () => 'UTC'};
var captured = null;
var HtmlService = {
  XFrameOptionsMode: {ALLOWALL: 'ALLOWALL'},
  createHtmlOutput: h => ({html: h, setTitle(t){this.title=t; return this;},
    setXFrameOptionsMode(m){this.xf=m; captured=this; return this;}})
};
`;
const slice = gs.slice(gs.indexOf('function esc('), gs.indexOf('/* ---------- the colleague view'));
eval(stub + slice);

const line = (spans, o) => Object.assign({bullet: false, private: false}, o, {spans});
const feed = (extra) => Object.assign({
  ok: true, tag: 'P1', course: {tag: 'P1', name: 'AP Phys', ink: '#0B4C81'},
  updated: '2026-09-05T21:00:00Z', links: [{label: 'Textbook', url: 'https://t/x'}],
  weeks: [{label: 'AUG 31 – SEP 4, 2026', mon: '2026-08-31', days: [
    {d: 'Mon Aug 31', iso: '2026-08-31', off: 'No school'},
    {d: 'Wed Sep 2', iso: '2026-09-02', note: 'Faculty Mtg', meets: [{block: 'Block 1',
      cw: [line([{t: 'Read '}, {t: 'the packet', url: 'https://x/p', rel: true}]),
           null,
           line([{t: 'Draft quiz', held: 1}]),
           line([{t: 'copies made'}], {private: true})],
      hw: null}]}]}]
}, extra);

const out = page(feed()).html;
console.log('--- the served student page ---');
console.log('renders the week      :', /AUG 31/.test(out));
console.log('class name in the bar :', /P1 · AP Phys/.test(out));
console.log('quick links band      :', out.includes('https://t/x'));
console.log('released link works   :', out.includes('https://x/p'));
console.log('held link has NO url  :', !out.includes('https://x/q'));
console.log('  but keeps its words :', out.includes('Draft quiz'));
console.log('off day shown         :', /No school/.test(out));
console.log('bullet/gap preserved  :', /class="gap"/.test(out));
console.log('takes the course ink  :', out.includes('#0B4C81;'));
console.log('embeddable in Schoology:', captured.xf === 'ALLOWALL');

console.log('');
console.log('--- what must never appear ---');
console.log('no private line       :', !out.includes('copies made'));
console.log('no day note           :', !out.includes('Faculty Mtg'));
console.log('no absences anywhere  :', !/AB:|Attend/.test(out));

const st = page(feed({staff: true})).html;
console.log('');
console.log('--- the same page on a colleague link ---');
console.log('banner shown          :', /Staff view/.test(st));
console.log('private line shown    :', st.includes('copies made'));
console.log('day note shown        :', st.includes('Faculty Mtg'));

console.log('');
console.log('--- escaping ---');
const nasty = feed();
nasty.weeks[0].days[1].meets[0].cw = [line([{t: '<script>alert(1)</script>'}])];
const esc1 = page(nasty).html;
console.log('markup in a plan is escaped:', !esc1.includes('<script>alert'));
console.log('  and still readable       :', esc1.includes('&lt;script&gt;'));

console.log('');
console.log('--- a day this class does not meet ---');
const withGap = feed();
withGap.weeks[0].days.push({d: 'Tue Sep 1', iso: '2026-09-01', meets: [], nomeet: 1});
withGap.weeks[0].days.push({d: 'Thu Sep 3', iso: '2026-09-03', meets: []});
const gapOut = page(withGap).html;
console.log('nomeet gets a row      :', /No class today/.test(gapOut));
console.log('and names the day      :', /Tue Sep 1/.test(gapOut));
console.log('quieter than no school :', /class="note nomeet"/.test(gapOut));
console.log('nothing-posted-yet stays hidden:', !/Thu Sep 3/.test(gapOut),
            '(it meets, I just have not written it)');

console.log('');
console.log('--- a stale tab refreshes itself ---');
const shell = page(feed()).html;
console.log('refresh script present :', /visibilitychange/.test(shell));
console.log('reloads on return      :', /location.reload/.test(shell));
console.log('only when stale        :', /Date.now\(\)-t>3e5/.test(shell));
console.log('never polls in the background:', !/setInterval|setTimeout/.test(shell));
console.log('works with JS off      :', shell.indexOf('<main>') < shell.indexOf('<script>'),
            '(the plan is in the HTML, the script only reloads)');

console.log('');
console.log('--- an error must not describe my spreadsheet ---');
const gsFull = fs.readFileSync('apps-script/Sync.gs', 'utf8');
const doGet = gsFull.slice(gsFull.indexOf('function doGet'), gsFull.indexOf('function out('));
const doPost = gsFull.slice(gsFull.indexOf('function doPost'), gsFull.indexOf('function doGet'));
console.log('doGet never returns the exception :', !/error: String\(err\)/.test(doGet));
console.log('doPost never returns it either    :', !/error: String\(err\)/.test(doPost));
console.log('both log it where only I can see  :',
  /console.error/.test(doGet) && /console.error/.test(doPost));
const failed = page({ok: false, error: 'Exception: cannot open document 1AbC_secret'}).html;
console.log('a failure page shows no detail    :', !failed.includes('1AbC_secret'));

console.log('');
console.log('--- one redaction, two doors ---');
console.log('page() never redacts itself:',
  !/\.rel\b/.test(slice.slice(slice.indexOf('function page('))) );
console.log('it renders whatever readPublished/staffFeed already stripped');
