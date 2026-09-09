/* A push that reaches the server but whose reply is lost must not come back as
   a conflict with myself. Poor school wifi does this constantly. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
const mem = {};
global.localStorage = {getItem: k => k in mem ? mem[k] : null, setItem: (k,v) => mem[k]=String(v)};
document.execCommand = () => false;
let asked = 0;
global.window.confirm = () => { asked++; return true; };
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
cfg = {url: 'https://x/exec', token: 't', device: 'MacIntel-abc'};

const KEY = '2026-09-02|P1|cw';
const mineLines = [{bullet:false, private:false,
  spans:[{t:'Energy stations', url:null, rel:false, priv:false}]}];

// the server already holds MY write; this machine never heard back
let served = null;
global.fetch = async (u, o) => {
  const req = JSON.parse(o.body);
  if (req.action !== 'push') return {json: async () => ({ok:true, now:'T2', records:[], saved:[], conflicts:[]})};
  served = req.records[0];
  return {json: async () => ({ok:true, now:'T2', saved:[], conflicts:[{
    key: KEY, updatedAt: 'T2', device: 'MacIntel-abc', lines: mineLines
  }]})};
};

queue[KEY] = mineLines; base[KEY] = 'T1';
await flush();
console.log('--- the reply was lost, the write had landed ---');
console.log('asked me to choose  :', asked, '(should be 0)');
console.log('still queued        :', Object.keys(queue).length, '(should be 0)');
console.log('base moved on       :', base[KEY], '(should be T2)');

// same device, but the content differs: my newer edit must win, silently
asked = 0;
const newer = [{bullet:false, private:false,
  spans:[{t:'Energy stations - revised', url:null, rel:false, priv:false}]}];
let pushes = 0;
global.fetch = async (u, o) => {
  const req = JSON.parse(o.body);
  if (req.action !== 'push') return {json: async () => ({ok:true, now:'T3', records:[], saved:[], conflicts:[]})};
  pushes++;
  if (pushes === 1) return {json: async () => ({ok:true, now:'T3', saved:[], conflicts:[{
    key: KEY, updatedAt: 'T3', device: 'MacIntel-abc', lines: mineLines }]})};
  return {json: async () => ({ok:true, now:'T4',
    saved:[{key: KEY, updatedAt: 'T4'}], conflicts:[]})};
};
queue[KEY] = newer; base[KEY] = 'T1';
await flush();
await new Promise(r => setTimeout(r, 30));
console.log('');
console.log('--- my newer edit, same machine ---');
console.log('asked me to choose  :', asked, '(should be 0)');
console.log('resent over the top :', pushes === 2);
console.log('queue cleared       :', Object.keys(queue).length === 0);

// a genuinely different machine must still stop and ask
asked = 0;
global.fetch = async (u, o) => {
  const req = JSON.parse(o.body);
  if (req.action !== 'push') return {json: async () => ({ok:true, now:'T5', records:[], saved:[], conflicts:[]})};
  return {json: async () => ({ok:true, now:'T5', saved:[], conflicts:[{
    key: KEY, updatedAt: 'T5', device: 'Win32-zzz',
    lines: [{bullet:false, private:false, spans:[{t:'from the desktop', url:null, rel:false, priv:false}]}]
  }]})};
};
queue[KEY] = newer; base[KEY] = 'T1';
await flush();
console.log('');
console.log('--- a real conflict, another machine ---');
console.log('asked me to choose  :', asked, '(should be 1)');
`;
eval('(async () => {' + load('data.js') + load('test/fixture.js') + load('render.js') +
     load('editor.js') + load('sync.js') + probe + '})()');
