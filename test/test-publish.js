/* Redaction and the publish horizon, run out of Sync.gs itself rather than a
   copy — these two decide what students can see, so testing a paraphrase of
   them would prove nothing. Both are written to be pure for this reason. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const gs = fs.readFileSync('apps-script/Sync.gs', 'utf8');

const grab = name => {
  const i = gs.indexOf('function ' + name + '(');
  let d = 0, j = gs.indexOf('{', i);
  for (let k = j; k < gs.length; k++) {
    if (gs[k] === '{') d++;
    else if (gs[k] === '}' && --d === 0) return gs.slice(i, k + 1);
  }
};
eval(grab('redactLines') + grab('horizonISO') + grab('iso'));

const span = (t, o) => Object.assign({t, url: null, rel: false, priv: false}, o);
const line = (spans, o) => Object.assign({bullet: false, private: false}, o, {spans});

console.log('--- redaction ---');
const src = [
  line([span('Read '), span('the packet', {url: 'https://x/p', rel: true})]),
  line([span('Draft quiz', {url: 'https://x/q', rel: false})]),
  line([span('copies made')], {private: true}),
  line([span('Timing '), span('43 min', {priv: true})]),
  null,
  line([span('Problem set', {url: 'https://x/ps', rel: true})], {bullet: true}),
  line([span('only for me', {priv: true})])
];
const out = redactLines(src);
out.forEach(l => console.log('   ' + (l === null ? '(blank)' :
  (l.bullet ? '- ' : '') + l.spans.map(s => s.t + (s.url ? ' <' + s.url + '>' : '')).join(''))));

const flat = out.filter(Boolean).flatMap(l => l.spans);
console.log('');
console.log('released keeps its url  :', flat.some(s => s.url === 'https://x/p'));
console.log('held keeps its words    :', flat.some(s => s.t === 'Draft quiz'));
console.log('held loses its url      :', !JSON.stringify(out).includes('x/q'));
console.log('// line gone            :', !JSON.stringify(out).includes('copies made'));
console.log('(( )) run gone          :', !JSON.stringify(out).includes('43 min'));
console.log('wholly private line gone:', !JSON.stringify(out).includes('only for me'));
console.log('blank line kept         :', out.includes(null));
console.log('bullet kept             :', out.some(l => l && l.bullet));
console.log('no rel/priv flags leak  :', !JSON.stringify(out).includes('"rel"') &&
                                          !JSON.stringify(out).includes('"priv"'));
const heldSpan = flat.find(s => s.t === 'Draft quiz');
console.log('held span is flagged    :', heldSpan && heldSpan.held === 1);
console.log('  but carries no url    :', heldSpan && !('url' in heldSpan));
console.log('released is not flagged  :', !flat.find(s => s.url && s.held));
console.log('empty cell -> null      :', redactLines([line([span('x')], {private: true})]) === null);

console.log('\n--- off-day labels: only the SEEDED ones are trimmed ---');
eval(grab('studentReason'));
const reasons = [
  ['Staff Day \u2014 Convocation, PD 8\u20133', 'No school'],
  ['Professional Day + faculty meeting', 'Professional Day'],   // reason kept, detail dropped
  ['Thanksgiving Recess', 'Thanksgiving Recess'],
  ['Winter Break \u2014 school reopens Jan 5', 'Winter Break'],
  ['', 'No school']
];
let rbad = 0;
for (const [raw, want] of reasons) {
  const got = studentReason(raw);
  if (got !== want) rbad++;
  console.log('  ' + (got === want ? 'ok  ' : 'FAIL') + '  ' +
    JSON.stringify(raw).padEnd(42) + '-> ' + JSON.stringify(got));
}
console.log('  ' + (rbad ? rbad + ' FAILED' : 'staff detail never reaches students'));

console.log('\n--- horizon: the week turns over Monday at 5am ---');
const at = (s) => horizonISO(new Date(s));
const cases = [
  ['Sun 2026-09-06 20:00', '2026-09-06T20:00:00', '2026-09-04'],
  ['Mon 2026-09-07 04:00', '2026-09-07T04:00:00', '2026-09-04'],
  ['Mon 2026-09-07 05:30', '2026-09-07T05:30:00', '2026-09-11'],
  ['Wed 2026-09-09 12:00', '2026-09-09T12:00:00', '2026-09-11'],
  ['Fri 2026-09-11 15:00', '2026-09-11T15:00:00', '2026-09-11'],
  ['Sat 2026-09-12 09:00', '2026-09-12T09:00:00', '2026-09-11']
];
let bad = 0;
for (const [name, when, want] of cases) {
  const got = at(when);
  if (got !== want) bad++;
  console.log('  ' + (got === want ? 'ok  ' : 'FAIL') + '  ' + name.padEnd(22) +
              '-> ' + got + (got === want ? '' : '   want ' + want));
}
console.log('\n' + (bad ? bad + ' FAILED' : 'horizon correct in every case'));
