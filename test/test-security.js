/* What a student who reads the public repo can and cannot do. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const gs = fs.readFileSync('apps-script/Sync.gs', 'utf8');

console.log('--- what is in the public repo ---');
/* This list was written by hand. It named four agenda/ files that have since
   been deleted, and it never covered test/ — which is in the repo too, and is
   exactly where a real student name reached a comment once before. Read what
   actually ships instead, so a new file is scanned the day it is added. */
const SKIP = /^(node_modules|\.git|fonts)$/;
const shipped = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    if (SKIP.test(e.name)) continue;
    const p = dir === '.' ? e.name : dir + '/' + e.name;
    if (e.isDirectory()) walk(p);
    else if (/\.(js|html|css|gs|json|md)$/.test(e.name)) shipped.push(p);
  }
})('.');
console.log('files scanned             :', shipped.length > 20, '(' + shipped.length + ')');
const repo = shipped.map(f => fs.readFileSync(f, 'utf8')).join('\n');
console.log('no token in any repo file :', !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/.test(repo));

/* A document id, but not an obvious placeholder — sheets-clipboard.html carries
   EXAMPLEDOCID2xxxx... on purpose, and failing on that teaches nobody anything. */
const ids = (repo.match(/spreadsheets\/d\/[A-Za-z0-9_-]{20,}/g) || [])
  .filter(u => !/EXAMPLE|xxxx/i.test(u));
console.log('no gradebook id           :', ids.length === 0, ids.join(' '));

/* A real name once reached a code comment as an "example" and sat in the public
   repo for weeks. This looks for the shape of a name after an attendance code,
   anywhere in anything that ships.
 *
 * The absence tests need realistic names to render, so the four they use are
 * declared here BY VALUE. Allowing a file instead would be lax in the dangerous
 * direction: a real name dropped into that same fixture would then be invisible,
 * and that is exactly the file it would land in. */
const INVENTED = ['N Alder', 'R Birch', 'J Cedar', 'S Dunn'];
const names = (repo.match(/\b(?:AB|T|TE|TX):\s*[A-Z]\s+[A-Z][a-z]+/g) || [])
  .map(m => m.replace(/^\w+:\s*/, ''))
  .filter(n => !INVENTED.includes(n));
console.log('no real student names     :', names.length === 0,
            names.length ? '-> ' + [...new Set(names)].join(', ') : '');

console.log('\n--- what the endpoint lets through without a token ---');
const doGet = gs.slice(gs.indexOf('function doGet'), gs.indexOf('function out('));
console.log('published agenda  : yes  (that is the point)');
/* Was looking for 'bad token' inside doGet; that wording lives in doPost, so
   this printed LEAKS while the token was in fact being checked. Assert the shape
   that matters: the diagnostics branch refuses before it answers. */
const diag = doGet.slice(doGet.indexOf('if (q.check || q.echo)'));
const refuseAt = Math.min.apply(null, ['does not match', 'add &token'].map(function (w) {
  var i = diag.indexOf(w); return i < 0 ? Infinity : i;
}));
console.log('diagnostics behind the token :',
  refuseAt < diag.indexOf('selfCheck()'));

console.log('\n--- what needs the token ---');
const doPost = gs.slice(gs.indexOf('function doPost'), gs.indexOf('function doGet'));
const guarded = /req.token !== want/.test(doPost);
console.log('every write action :', guarded ? 'token checked before any action' : 'UNGUARDED');
for (const a of ['pull', 'push', 'title', 'absences', 'calendar', 'publish']) {
  const line = doPost.indexOf("'" + a + "'");
  console.log('  ' + a.padEnd(9), line > doPost.indexOf('bad token') ? 'behind the token' : 'BEFORE THE CHECK');
}

console.log('\n--- what a published feed can never contain ---');
const red = gs.slice(gs.indexOf('function redactLines'), gs.indexOf('function horizonISO'));
console.log('held link urls    :', /sp.rel \? \{t: sp.t, url: sp.url\} : \{t: sp.t, held: 1\}/.test(red.replace(/\s+/g,' '))
  ? 'stripped' : 'CHECK THIS');
console.log('private lines     :', /if \(l.private\) continue/.test(red) ? 'stripped' : 'CHECK THIS');
console.log('absences          :', !/absent/i.test(gs.slice(gs.indexOf('function publish'), gs.indexOf('function readPublished')))
  ? 'never in publish at all' : 'CHECK THIS');
