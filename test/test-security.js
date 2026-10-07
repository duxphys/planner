/* What a student who reads the public repo can and cannot do. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const gs = fs.readFileSync('apps-script/Sync.gs', 'utf8');

console.log('--- what is in the public repo ---');
const repo = ['index.html','styles.css','render.js','editor.js','sync.js','data.js',
              'agenda/index.html','agenda/agenda.js','agenda/agenda.css','agenda/endpoint.js']
  .map(f => fs.readFileSync(f, 'utf8')).join('\n');
console.log('no token in any repo file :', !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/.test(repo));
console.log('no gradebook id           :', !/spreadsheets\/d\/[A-Za-z0-9_-]{20,}/.test(repo));
/* a real name once reached a code comment as an "example" — this looks for the
   shape of a name after an attendance code, wherever it appears */
const names = repo.match(/\b(AB|T|TE|TX):\s*[A-Z]\s+[A-Z][a-z]+/g) || [];
console.log('no student names          :', names.length === 0, names.join(' '));

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
