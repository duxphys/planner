/* Day notes at the top of a column: editable, undoable, and synced like cells. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8')
  .replace(/<link[^>]*>/g,'').replace(/<script[^>]*><\/script>/g,'').replace('<script>start();</script>','');
const dom = new JSDOM(html, {pretendToBeVisual:true});
global.window = dom.window; global.document = dom.window.document;
const mem = {};
global.localStorage = {getItem: k => k in mem ? mem[k] : null, setItem: (k,v) => mem[k]=String(v)};
Object.defineProperty(globalThis, 'navigator', {value:{platform:'Test'}, configurable:true});
document.execCommand = () => false;
const pushed = [];
global.fetch = async (url, opt) => {
  const req = JSON.parse(opt.body);
  if (req.action === 'push') { pushed.push(...req.records.map(r => r.key));
    return {json: async () => ({ok:true, now:new Date().toISOString(),
      saved: req.records.map(r => ({key:r.key, updatedAt:new Date().toISOString()})), conflicts:[]})}; }
  return {json: async () => ({ok:true, now:new Date().toISOString(), records:[], byTag:{}})};
};
const load = f => fs.readFileSync(f,'utf8');
const probe = `
loadPrefs(); wireToolbar(); wireEditor(); render();
loadSync(); cfg.url='https://fake/exec'; cfg.token='good';

(async () => {
  console.log('weeks available     :', WEEKS.length);
  console.log('first / last        :', WEEKS[0].label, '->', WEEKS[WEEKS.length-1].label);

  // arrows stop rather than wrap
  winStart = 0; render();
  console.log('prev disabled at start:', document.getElementById('prev').disabled);
  document.getElementById('prev').click();
  console.log('prev does nothing     :', winStart === 0);
  const last = DAYS.length - SPAN;
  winStart = last; render();
  console.log('next disabled at end  :', document.getElementById('next').disabled);
  document.getElementById('next').click();
  console.log('next does nothing     :', winStart === last);

  // the note is editable
  winStart = 5; render();
  const note = document.querySelector('.dhnote[data-f=note]');
  console.log('');
  console.log('note field exists     :', !!note);
  const before = note.textContent;
  openCell(note);
  console.log('opens for editing     :', editing === note);
  note.dispatchEvent(new window.InputEvent('beforeinput',
    {bubbles:true, cancelable:true, inputType:'insertText', data:'D'}));   // as typing would
  note.innerHTML = '<div class="ln">Dept meeting 3-4</div>';
  closeCell();
  console.log('saved to the day      :', WEEKS[1].days.some(d => (d.noteLines||[]).some(l => l && l.spans[0].t === 'Dept meeting 3-4')));
  await new Promise(r => setTimeout(r, 20));
  console.log('pushed as a record    :', pushed.some(k => /\\|day\\|note$/.test(k)), pushed.filter(k=>/day\\|note/.test(k))[0]);

  // undo reaches it
  stepBack();
  console.log('undo restores it      :', document.querySelector('.dhnote[data-f=note]').textContent === before);

  // students never see notes
  student = true; render();
  console.log('hidden from students  :', !document.querySelector('.dhnote'));
  student = false; render();

  // --- the school's reason is its own field ---
  winStart = 0; render();
  const offEl = document.querySelector('.dhoff[data-f=off]');
  console.log('');
  console.log('off-day field exists  :', !!offEl);
  console.log('seeded from the sheet :', /Staff Day/.test(offEl.textContent));
  openCell(offEl);
  offEl.dispatchEvent(new window.InputEvent('beforeinput',
    {bubbles:true, cancelable:true, inputType:'insertText', data:'x'}));
  offEl.innerHTML = '<div class="ln">Snow day</div>';
  closeCell();
  const day = WEEKS[0].days.find(d => d.offLines && d.offLines[0].spans[0].t === 'Snow day');
  console.log('edits save to the day :', !!day);
  console.log('day cells follow it   :', /Snow day/.test(document.getElementById('app').innerHTML));
  await new Promise(r => setTimeout(r, 20));
  const offKeys = pushed.filter(k => k.slice(-4) === '|off');
  const noteKeys = pushed.filter(k => k.slice(-5) === '|note');
  console.log('pushed under |day|off :', offKeys.length ? offKeys[0] : 'NONE');
  console.log('note pushed separately:', noteKeys.length ? noteKeys[0] : '(none)');
  console.log('two distinct records  :', offKeys.length > 0 && noteKeys.length > 0 &&
              offKeys[0] !== noteKeys[0]);
  stepBack();
  console.log('undo restores it      :', !/Snow day/.test(document.querySelector('.dhoff').textContent));
})();
`;
eval(load('data.js') + load('test/fixture.js') + load('render.js') + load('editor.js') + load('sync.js') + probe);

/* The school's reason and my own note are two different fields on the same day. */
