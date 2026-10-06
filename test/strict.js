/* Makes a test able to fail. Preloaded before every test file by run-all.js
 * (node -r ./strict.js test-x.js), so no test needed editing to gain this.
 *
 * The suite used to report success whenever nothing threw. No file in test/
 * called process.exit, and run-all.js only read exit codes — so a line
 * printing `false` was invisible, and `51/51 passed` meant only "51 files ran".
 * A deliberately removed safety check still passed. That is the failure mode
 * the project warns about: a check wrong in the lax direction passes silently
 * forever.
 *
 * What counts as a failure here is a TYPE, not a word in the output:
 *
 *   console.log('has a header :', false)     -> fails. A real boolean false.
 *   console.log(i, '| line-private', 'false')-> does not. That is data; the
 *                                               test prints the flag's value.
 *
 * Checking the type rather than scanning the text is the whole point. Text
 * scanning is what made the old held-link check vacuous.
 *
 * A few tests report a verdict as a word instead of a boolean, so those words
 * are listed too. They err strict: a false positive turns the suite red, which
 * is safe. Only silence is dangerous.
 *
 * WHEN WRITING A TEST, two rules follow from this:
 *
 *   1. A verdict must read true = good. Printing a raw fact where false is the
 *      PASS makes the suite red and tells the next person nothing.
 *   2. A verdict must BE a boolean. `obj && obj.x === 1` evaluates to null when
 *      obj is null — and null is not false, so it slips through here as a
 *      non-verdict and asserts nothing. Write `!!obj && obj.x === 1`. This bit
 *      a brand new test on the day strict.js was written.
 */
const FAIL_WORDS = /\bFAILED?\b|CHECK THIS|LEAKS|\bNOT CHECKED\b|\bMISSING\b/;

const bad = [];
let verdicts = 0;
const real = console.log.bind(console);

const show = a => typeof a === 'string' ? a : require('util').inspect(a);

console.log = function (...args) {
  real(...args);
  for (const a of args) if (a === true || a === false) verdicts++;
  if (args.some(a => a === false)) {
    bad.push(args.map(show).join(' '));
    return;
  }
  const word = args.find(a => typeof a === 'string' && FAIL_WORDS.test(a));
  if (word !== undefined) bad.push(args.map(show).join(' '));
};

process.on('exit', function () {
  /* Already failing for another reason — a throw, a rejection. Leave it. */
  if (process.exitCode) { report(); return; }
  if (!verdicts) {
    real('\nSTRICT: this file reported no true/false verdict at all.');
    real('A test that asserts nothing cannot fail. Give it a boolean.');
    process.exitCode = 1;
    return;
  }
  if (bad.length) { report(); process.exitCode = 1; }
});

function report() {
  if (!bad.length) return;
  real('\nSTRICT: ' + bad.length + ' failed assertion' + (bad.length === 1 ? '' : 's') + ':');
  for (const b of bad) real('  ' + b);
}
