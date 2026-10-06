/* An expired GitHub token fails silently — students just see an old plan.
   So it is tested when entered and reported by Check health. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const gs = fs.readFileSync('apps-script/Sync.gs', 'utf8');
const fn = n => {
  const i = gs.indexOf('function ' + n + '(');
  let d = 0;
  for (let k = gs.indexOf('{', i); k < gs.length; k++) {
    if (gs[k] === '{') d++;
    else if (gs[k] === '}') { d--; if (!d) return gs.slice(i, k + 1); }
  }
};

let reply = {code: 200, headers: {}};
const stub = `
var PropertiesService = {getScriptProperties: () => ({
  getProperty: k => ({GH_REPO: 'duxphys/planner', GH_TOKEN: 'github_pat_x'})[k] || ''})};
var UrlFetchApp = {fetch: () => ({
  getResponseCode: () => reply.code,
  getHeaders: () => reply.headers,
  getAllHeaders: () => reply.headers })};
var Utilities = {formatDate: (d) => d.toISOString().slice(0,10)};
var Session = {getScriptTimeZone: () => 'UTC'};
`;
eval(stub + fn('ghConfig') + fn('ghStatus'));

const cases = [
  ['401 expired or revoked', 401, {}],
  ['403 missing permission', 403, {}],
  ['404 wrong repo',         404, {}],
  ['500 something else',     500, {}],
];
console.log('--- failures are named, not swallowed ---');
for (const [label, code] of cases) {
  reply = {code, headers: {}};
  const r = ghStatus();
  console.log('  ' + label.padEnd(24), r.ok ? 'REPORTED OK (wrong)' : r.why);
}

console.log('');
console.log('--- a working token reports how long it has ---');
const soon = new Date(Date.now() + 9 * 86400000).toISOString().replace('T',' ').slice(0,19) + ' UTC';
const far  = new Date(Date.now() + 300 * 86400000).toISOString().replace('T',' ').slice(0,19) + ' UTC';
reply = {code: 200, headers: {'github-authentication-token-expiration': far}};
let r = ghStatus();
console.log('  a year out :', r.ok === true && r.soon !== true,
            '|', r.exp, '| warns:', String(!!r.soon));
reply = {code: 200, headers: {'github-authentication-token-expiration': soon}};
r = ghStatus();
console.log('  nine days  :', r.ok, '|', r.exp, '| warns:', !!r.soon);
reply = {code: 200, headers: {}};
r = ghStatus();
console.log('  no expiry header (classic token):', r.ok, '| exp:', JSON.stringify(r.exp));

console.log('');
console.log('--- and it is checked at the moment it is entered ---');
console.log('setGithub calls ghStatus :', /var st = ghStatus\(\)/.test(fn('setGithub')));
console.log('refuses to claim success :', /GitHub refused it/.test(fn('setGithub')));
console.log('checkHealth calls it too  :', /ghStatus\(\)/.test(fn('checkHealth')));
