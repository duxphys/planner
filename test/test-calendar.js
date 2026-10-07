/* The calendar the app hands over must describe the year without carrying any
   plan content — it is stored server-side and feeds the student pages. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
const mem = {};
global.localStorage = {getItem: k => k in mem ? mem[k] : null, setItem: (k,v) => mem[k]=String(v)};
Object.defineProperty(globalThis, 'navigator', {value:{platform:'Test'}, configurable:true});
document.execCommand = () => false;
let sentCal = 0, lastPayload = null;
global.fetch = async (u, o) => {
  const req = JSON.parse(o.body);
  if (req.action === 'calendar') { sentCal++; lastPayload = req; return {json: async () => ({ok:true, weeks: (req.weeks||[]).length})}; }
  return {json: async () => ({ok:true, now:'X', records:[], saved:[], conflicts:[], byTag:{}})};
};
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
loadSync(); cfg.url='https://fake/exec'; cfg.token='good';
(async () => {
  const n = await sendCalendar();
  console.log('weeks sent          :', n);
  console.log('courses described   :', Object.keys(lastPayload.courses).map(p => lastPayload.courses[p].tag).join(' '));
  const text = JSON.stringify(lastPayload);
  console.log('carries no plan text:', !text.includes('spans'));
  console.log('carries no urls     :', !text.includes('http'));
  console.log('carries no day notes:', !text.includes('Faculty'));
  const d = lastPayload.weeks[0].days[2];
  console.log('a day looks like    :', JSON.stringify({d: d.d, iso: d.iso, cycle: d.cycle, blocks: d.blocks.length}));
  const sent = sentCal;
  await sendCalendar();
  console.log('unchanged: not resent:', sentCal === sent);
  WEEKS[0].label = 'CHANGED';
  await sendCalendar();
  console.log('changed: resent      :', sentCal === sent + 1);
})();
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
