# Lesson planner

A static page that plans my week and syncs through an Apps Script endpoint.
No build step, no dependencies, nothing fetched from the network at runtime.

Separate repo, deployment and token from the homework checker
(`darkspireteach/hw`) and the document namer. They share knowledge, not code:
each has its own Apps Script project, and none writes to another's workbook.

## Files

| | |
|---|---|
| `index.html` | the page. Every asset carries `?v=N` — see **Cache stamp** below |
| `styles.css` | all styling, plus the `@font-face` rules |
| `data.js` | the calendar: weeks, days, rotation, courses |
| `render.js` | both week views, the toolbar, view preferences |
| `editor.js` | in-place editing, links as records, undo |
| `sync.js` | pull, queued push, version guard, offline queue |
| `fonts/` | Source Sans 3, three faces, shipped deliberately |
| `apps-script/Sync.gs` | the endpoint's source, versioned here so the tests can run it |
| `test/` | `node run-all.js` |

Nothing in this repo is secret. The sync token is entered per machine at
runtime and lives in that browser; the endpoint's own token lives in Script
Properties.

## Cache stamp

`index.html` references every asset as `file.js?v=N`. **Bump `N` in the same
change as any file it points at.** Three machines run this, and without the bump
they keep serving the previous copy out of cache — the change is uploaded and
simply is not there. That has happened once.

It is the front-end equivalent of `VERSION` in `Sync.gs`.

## Putting it online

1. Upload everything here, keeping `fonts/` and `test/` as folders.
2. **Settings ▸ Pages ▸ Source: Deploy from a branch ▸ main ▸ / (root) ▸ Save.**
3. On each machine: shift-click **Sync**, paste the `/exec` URL and the token.

## The endpoint

`apps-script/Sync.gs` is the only `.gs` file in the planner spreadsheet's Apps
Script project. `Publish.gs` and `Extend.gs` were deleted on 19 Sep 2026 — every
`.gs` file in one project shares a single namespace and the last parsed wins, so
a leftover file silently overrides live code. The gradebook readers that used to
live in `Publish.gs` are now the `gb*` functions here.

After changing it: **Deploy ▸ Manage deployments ▸** pencil **▸ Version: New
version ▸ Deploy.** Never *New deployment* — that issues a new URL and every
Schoology link breaks.

Hovering **Sync** in the app shows which deployment and version that machine is
talking to. `…/exec?ping=1` returns the version with no token.

## Backups

After a save, if the last copy is a week old, the endpoint writes every record
to Drive ▸ **Planner backups** as `Planner records YYYY-MM-DD.json` — each row
exactly as stored — and keeps the newest eight. A backup that fails never fails
the save; it is retried the next day, and **Check health** shows the last copy
and any failure. **Planner sync ▸ Back up records now** makes one on demand.

The record tab grows itself: a save that needs a row past the tab's last one
adds 500 more first.

## The student page

The endpoint renders it: `…/exec?class=p1&page=1`, one URL per class, in
Schoology as a link or an iframe. Plain HTML with inline CSS — no fetch, no font
file — so it works with JavaScript off, and it is on `script.google.com`, which
the school cannot block without breaking Workspace.

**Never `?c=`.** Google intercepts that parameter name and the request never
reaches the script at all.

Redaction is server-side and happens before any payload is built: private `//`
lines, `(( ))` runs, held-link URLs and absences never leave the endpoint.
`page()` renders whatever it is handed and strips nothing itself.

Publishing is `Planner sync ▸ Publish to students now`, or every 15 minutes with
the trigger on. Students see through the Friday of the current week.

## Tests

    cd test
    npm install          # jsdom, once
    node run-all.js      # the audit, then every behaviour test

Every test is preloaded with `strict.js`, which fails a run when a logged value
is the boolean `false`. Before that, no test set an exit code and the runner read
exit codes only — so the suite reported success with a safety check deliberately
removed. When writing a test: a verdict must read **true = good**, and it must
**be** a boolean (`obj && obj.x` is `null`, not `false`, and slips through).

`test-harness.js` is the guard against that returning. It copies the app, breaks
one protection at a time, and insists the matching test goes red — and checks
each one passes on an unbroken copy, so a check that always fails cannot pose as
working.

`audit.js` enforces what must never break: five weekday columns, absences and
private notes kept out of the student view, held links carrying no URL, no
red/green pair carrying meaning, and nothing loaded from the network.

`test-security.js` walks everything that ships, looking for tokens, document ids
and anything shaped like a student name. The fixture names it allows are
declared in that file by value, not by filename.

`golden.js` writes every rendered state to `/tmp/golden.txt` — 216 of them. Run
it before and after a structural change and diff the two. It is deliberately not
in `run-all.js`: a markup snapshot would fail on every intentional UI change.

## Not done yet

- Reading `Courses` and `Build Calendar`, so `data.js` stops being hardcoded.
  Until then the calendar ends where the sheet's built weeks end.
- A single-class view with its days running down the page.
