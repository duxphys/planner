/* Test content.
 *
 * data.js ships the calendar and nothing else — plan content lives behind the
 * token, and baking real cells in would publish document links in the repo.
 * So the tests bring their own, which is better anyway: known content beats
 * whatever happened to be in an export.
 *
 * Loaded after data.js; mutates WEEKS in place.
 */
(function seed() {
  /* key order matters: the round-trip check compares serialised records, so a
     span here must be built in the same order the parser builds one */
  const span = s => ({t: s.t, url: s.url || null, rel: !!s.rel, priv: !!s.priv});
  const line = (spans, opt) => Object.assign({bullet: false, private: false}, opt || {},
    {spans: spans.map(span)});

  const cw = [
    line([{t: 'Hand Out Course Expectations Signature Sheet'}]),
    null,
    line([{t: 'Start '}, {t: '00.LAB.1a - Lab', url: 'https://x.test/lab1a', rel: true}]),
    line([{t: 'Linearization data', url: 'https://x.test/lin', rel: false}], {private: true}),
    line([{t: '00.LAB.1b - Data Sheet', url: 'https://x.test/lab1b', rel: true}], {bullet: true}),
    line([{t: 'Graphical Methods', url: 'https://x.test/graph', rel: false}], {bullet: true}),
    line([{t: 'Timing '}, {t: '1:02 - 1:45 (43 min)', priv: true}])
  ];
  const hw = [
    line([{t: 'Read the packet'}]),
    line([{t: '00.3 - Problems', url: 'https://x.test/p3', rel: true}], {bullet: true}),
    line([{t: 'copies made'}], {private: true})
  ];

  const clone = x => JSON.parse(JSON.stringify(x));
  let filled = 0;
  for (const w of WEEKS) {
    for (const d of w.days) {
      if (!d.cycle) continue;
      for (const b of d.blocks) {
        if (!b.course) continue;
        b.cw = clone(cw);
        if (!b.asp) b.hw = clone(hw);
        filled++;
        if (filled >= 8) return;          // enough to exercise every path
      }
    }
  }
})();
