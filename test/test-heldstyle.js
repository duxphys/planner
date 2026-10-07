/* The look of a held link, checked as declarations rather than pixels: jsdom
   resolves neither variables nor the cascade. */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));   // run from anywhere
const css = fs.readFileSync('styles.css','utf8');
/* anchor to the start of a line, or 'a.h{' also matches inside '.pvs a.h{' */
const rule = sel => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp('(?:^|\\n)' + esc + '\\{([^}]*)\\}'));
  return m ? m[1].replace(/\s+/g, ' ') : null;
};
const held = rule('a.h'), rel = rule('a.l');
console.log('held link  :', held);
console.log('released   :', rel);
console.log('');
console.log('held is NOT bold      :', /font-weight:400/.test(held));
console.log('held is dotted        :', /underline dotted/.test(held));
console.log('held has no box       :', !/border:/.test(held));
console.log('released is solid     :', /text-decoration:underline;/.test(rel));
console.log('released IS bold      :', /font-weight:600/.test(rel));
console.log('released is the heavier one:',
  /font-weight:600/.test(rel) && /font-weight:400/.test(held));
console.log('held reads as body text:', /var\(--ink\)/.test(held) && /font-weight:400/.test(held));
console.log('but is marked as a link:', /dotted/.test(held));
console.log('released still stands out:', /var\(--link\)/.test(rel) && /font-weight:600/.test(rel));
const hidden = rule('.pv a.h, .pvs a.h');
console.log('');
console.log('inside hidden text    :', hidden);
console.log('box kept there        :', /border:1px dashed/.test(hidden));
console.log('bold dropped there    :', /font-weight:400/.test(hidden));
const spec = sel => ((sel.match(/\.[a-zA-Z-]+/g)||[]).length)*10 + ((sel.match(/(^|\s)[a-z]+/g)||[]).length);
console.log('hidden rule wins      :', spec('.pv a.h') > spec('a.h'));
