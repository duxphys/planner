/* Students read a static file beside the page; colleagues still ask the
   endpoint, because the static one carries none of my notes. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');
const shell = fs.readFileSync('agenda/index.html','utf8');

function run(search, opts) {
  const dom = new JSDOM(shell.replace(/<script src[^>]*><\/script>/g,''),
    {url: 'https://duxphys.github.io/planner/agenda/' + search, runScripts: 'dangerously'});
  const asked = [];
  dom.window.ENDPOINT = 'https://script.google.com/macros/s/X/exec';
  dom.window.fetch = (u) => { asked.push(u); return Promise.resolve(
    {ok: (opts||{}).ok !== false, status: (opts||{}).status || 200,
     json: async () => ({ok:true, updated:'T', weeks:[]})}); };
  const inline = /<script>([\s\S]*?)<\/script>/.exec(shell)[1];
  dom.window.eval(inline);
  return asked;
}

console.log('--- where the first request goes ---');
const s = run('?class=p1');
console.log('student :', s[0]);
console.log('  static, same origin as the page:', s[0].startsWith('feed/p1.json'));
const c = run('?class=p1&k=secret');
console.log('colleague:', c[0].replace(/macros.*exec/, 'exec'));
console.log('  goes to the endpoint           :', c[0].includes('exec'));
console.log('  the secret never hits the CDN  :', !s.join().includes('secret'));

console.log('');
console.log('--- the page still works before the first push ---');
const src = fs.readFileSync('agenda/agenda.js','utf8');
console.log('404 on the static feed falls back:', /res.status === 404\) return loadFromEndpoint/.test(src));
console.log('fallback exists                  :', /async function loadFromEndpoint/.test(src));

console.log('');
console.log('--- a returning student sees something at once ---');
console.log('draws from local copy first :', /drawFromCache\(\)/.test(src));
console.log('only for students           :', /!key && drawFromCache/.test(src));
console.log('colleague feed is never kept:', /if \(!key\) keep\(data\)/.test(src));

console.log('');
console.log('--- the endpoint only writes what students may see ---');
const gs = fs.readFileSync('apps-script/Sync.gs','utf8');
const push = gs.slice(gs.indexOf('function pushFeeds'), gs.indexOf('/* ---------- the page'));
console.log('pushes readPublished, not staffFeed:',
  /readPublished\(tag\)/.test(push) && !/staffFeed/.test(push));
console.log('token kept in script properties    :', /GH_TOKEN/.test(gs) && !/ghp_/.test(gs));
console.log('no repo churn when nothing changed :', /return 'unchanged'/.test(gs));
