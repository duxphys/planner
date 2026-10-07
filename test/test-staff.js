/* The staff feed must never carry absences, and must need its own token.
 *
 * This file used to render the colleague and student views through the agenda/
 * renderer and compare them. That renderer was deleted when students moved to
 * the page Sync.gs serves, and the colleague links were withdrawn on 19 Sep —
 * so that half was driving code that no longer ships. The rendering difference
 * it protected is now covered against the real served page in
 * test-serverpage.js ("the same page on a colleague link").
 */
const fs = require('fs');
process.chdir(require('path').join(__dirname, '..'));

// and the endpoint keeps absences out of both
const gs = fs.readFileSync('apps-script/Sync.gs', 'utf8');
const feed = gs.slice(gs.indexOf('function staffFeed'), gs.indexOf('/* ---------- document titles'));
console.log('');
console.log('staff feed never touches absences:', !/absen/i.test(feed));
console.log('staff feed needs its own token   :',
  /var staff = !!\(q\.k && q\.k === vt\)/.test(gs) &&
  /getProperty\('VIEW_TOKEN'\)/.test(gs) &&
  /if \(q\.k && !vt\)/.test(gs));
console.log('and it is not the write token    :',
  gs.indexOf("getProperty('VIEW_TOKEN')") !== gs.indexOf("getProperty('TOKEN')"));
