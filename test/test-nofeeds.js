/* District instructional content must not be written to, or read from, a host
   outside the district. This replaces test-fastfeed.js, which asserted the
   opposite: student pages used to read a static feed file from the repository,
   which was faster and put classwork and released Drive links on a personally
   owned public host. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');

/* The page that used to be probed here lived in agenda/ and fetched the feed
   itself. It was deleted: students are served by Sync.gs, which reads nothing
   outside the district at all. So the strongest statement is no longer "the
   page asks only the endpoint" but "there is no such page, and nothing left
   points at a repository path". */
console.log('--- nothing in the front end points at a repository path ---');
console.log('  the agenda/ folder is gone :', !fs.existsSync('agenda'));
const front = ['index.html', 'render.js', 'editor.js', 'sync.js']
  .map(f => fs.readFileSync(f, 'utf8')).join('\n');
console.log('  no feed/ path      :', !/['"`]feed\//.test(front));
console.log('  no github api call :', !/api\.github\.com/.test(front));

console.log('');
console.log('--- the endpoint no longer publishes to GitHub on its own ---');
const gs = fs.readFileSync('apps-script/Sync.gs', 'utf8');
const publish = gs.slice(gs.indexOf('function publish('), gs.indexOf('function readPublished'));
/* pushFeeds was not just switched off, it was removed. These two lines still
   asked whether it was called and whether it guarded itself — both false, for
   the wrong reason. Assert it is gone, which is the stronger claim. */
console.log('  publish never pushes feeds    :', !/pushFeeds/.test(publish));
console.log('  and pushFeeds is gone entirely:', !/function pushFeeds/.test(gs));
console.log('  no ghPut left to write with   :', !/function ghPut/.test(gs));
/* Then the rest went too (v42): nothing in the endpoint can reach GitHub, or
   any host outside Google, at all. */
console.log('  no GitHub function left       :', !/function (gh[A-Z]\w*|setGithub|authoriseGitHub|removeGithubFeeds)\(/.test(gs));
console.log('  no outbound request at all    :', !/UrlFetchApp/.test(gs));
console.log('  a stored credential is reported:', /GH_TOKEN/.test(gs.slice(gs.indexOf('function checkHealth'))));

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
for (const fn of ['buildPublished', 'backup']) {
  console.log('  ' + fn.padEnd(18), /absen/i.test(body(fn)) ? 'MENTIONS ABSENCES' : 'never touches absences');
}
