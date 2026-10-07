const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<body><div id="app"></div><div id="pop"></div></body>');
global.window = dom.window; global.document = dom.window.document;
const load = f => fs.readFileSync(f,'utf8');
const probe = `
const sample = {bullet:false, private:false, spans:[
  {t:'Read ', url:null, rel:false},
  {t:'the packet', url:'https://x.test/p', rel:false},
  {t:' and ', url:null, rel:false},
  {t:'the guide', url:'https://x.test/g', rel:true}
]};
student = false;
console.log('teacher :', lineHTML(sample));
student = true;
const out = lineHTML(sample);
console.log('preview :', out);
console.log('held link is not clickable :', !/the packet<\\/a>/.test(out) && out.indexOf('x.test/p') === -1);
console.log('released link still a link :', out.indexOf('x.test/g') !== -1);
console.log('marker carries no url      :', /<span class="pend">the packet<\\/span>/.test(out));
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + probe);
