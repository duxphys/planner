const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<div id="app"></div><div id="pop"></div>', {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
const load = f => fs.readFileSync(f,'utf8');
const probe = `
student = false;
const l = {bullet:false, private:false, spans:[
  {t:'Lab writeup ', url:null, rel:false, priv:false},
  {t:'check ', url:null, rel:false, priv:true},
  {t:'the packet', url:'https://x.test/p', rel:true, priv:true},
  {t:' first', url:null, rel:false, priv:true},
  {t:' due Friday', url:null, rel:false, priv:false}
]};
const view = lineHTML(l);
console.log('one wrapper for the run  :', (view.match(/class="pvs"/g)||[]).length === 1);
console.log('link stays inside the run:', /<span class="pvs">[^<]*<a /.test(view));
console.log('no brackets in the markup:', !view.includes('((') && !/\\(check/.test(view));

// the brackets must not survive a copy from a closed cell
const el = document.createElement('div');
el.innerHTML = '<div class="ln">' + view.replace(/^<p[^>]*>|<\\/p>$/g,'') + '</div>';
const back = cellLines(el).filter(Boolean);
const text = back.flatMap(x => x.spans).map(s => s.t).join('');
console.log('round trip adds nothing  :', !text.includes('(') && !text.includes(')'));
console.log('privacy survives the trip:', back[0].spans.filter(s => s.priv).length === 3);

// editing still shows the real markers
const edit = editHTML([l]);
console.log('edit view shows (( ))    :', edit.includes('((') && edit.includes('))'));

// students see none of it
student = true;
const pub = lines([l]);
console.log('students see no note     :', !pub.includes('check') && !pub.includes('pvs'));
console.log('students keep the rest   :', pub.includes('Lab writeup') && pub.includes('due Friday'));
student = false;
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);
