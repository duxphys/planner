/* District instructional content must not be written to, or read from, a host
   outside the district. This replaces test-fastfeed.js, which asserted the
   opposite: student pages used to read a static feed file from the repository,
   which was faster and put classwork and released Drive links on a personally
   owned public host. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');

console.log('--- the student page asks only the endpoint ---');
const shell = fs.readFileSync('agenda/index.html', 'utf8');
function firstRequest(search) {
  const dom = new JSDOM(shell.replace(/<script src[^>]*><\/script>/g, ''),
    {url: 'https://x.test/agenda/' + search, runScripts: 'dangerously'});
  const asked = [];
  dom.window.ENDPOINT = 'https://script.google.com/macros/s/X/exec';
  dom.window.fetch = u => { asked.push(u); return Promise.resolve(
    {ok: true, status: 200, json: async () => ({ok: true, updated: 'T', weeks: []})}); };
  dom.window.eval(/<script>([\s\S]*?)<\/script>/.exec(shell)[1]);
  return asked[0] || '';
}
const s = firstRequest('?class=p1'), c = firstRequest('?class=p1&k=secret');
console.log('  student  :', s.replace(/macros.*exec/, 'exec'));
console.log('  colleague:', c.replace(/macros.*exec/, 'exec'));
console.log('  neither reads a static file:', !/feed\//.test(s) && !/feed\//.test(c));

console.log('');
console.log('--- nothing in the front end points at a repository path ---');
const front = ['agenda/index.html', 'agenda/agenda.js', 'agenda/agenda.css',
               'index.html', 'render.js', 'editor.js', 'sync.js']
  .map(f => fs.readFileSync(f, 'utf8')).join('\n');
console.log('  no feed/ path      :', !/['"`]feed\//.test(front));
console.log('  no github api call :', !/api\.github\.com/.test(front));

console.log('');
console.log('--- the endpoint no longer publishes to GitHub on its own ---');
const gs = fs.readFileSync('apps-script/Sync.gs', 'utf8');
const publish = gs.slice(gs.indexOf('function publish('), gs.indexOf('function readPublished'));
console.log('  publish still calls pushFeeds :', /pushFeeds\(\)/.test(publish),
            '(harmless: it does nothing without a stored repo)');
console.log('  pushFeeds stops when unset    :',
  /if \(!cfg\.token \|\| !cfg\.repo\) return null/.test(gs));
console.log('  a way to delete what is there :', /function removeGithubFeeds/.test(gs));
console.log('  which also clears the token   :',
  /deleteProperty\('GH_TOKEN'\)/.test(gs.slice(gs.indexOf('function removeGithubFeeds'))));

console.log('');
console.log('--- and student data still never reaches any of it ---');
const body = name => {                       // exactly one function, by its braces
  const i = gs.indexOf('function ' + name + '(');
  let d = 0;
  for (let k = gs.indexOf('{', i); k < gs.length; k++) {
    if (gs[k] === '{') d++;
    else if (gs[k] === '}') { d--; if (!d) return gs.slice(i, k + 1); }
  }
  return '';
};
for (const fn of ['buildPublished', 'pushFeeds', 'removeGithubFeeds']) {
  console.log('  ' + fn.padEnd(18), /absen/i.test(body(fn)) ? 'MENTIONS ABSENCES' : 'never touches absences');
}
