# Lesson planner

A static page that plans my week and syncs through an Apps Script endpoint.
No build step, no dependencies, nothing fetched from the network.

Separate repo, deployment and token from the homework app at `/hw`. This one
must never touch that one.

## Files

| | |
|---|---|
| `index.html` | the page |
| `styles.css` | all styling, plus the `@font-face` rules |
| `data.js` | the calendar: weeks, days, rotation, courses |
| `render.js` | both week views, the toolbar, view preferences |
| `editor.js` | in-place editing, links as records, undo |
| `sync.js` | pull, queued push, version guard, offline queue |
| `fonts/` | Source Sans 3, three faces, shipped deliberately |
| `test/` | `node audit.js` for the constraints, `test-*.js` for behaviour |

## Putting it online

1. Make a **new** repo — not the homework one. Public is fine; nothing secret
   lives here, and the token is entered per machine at runtime.
2. Upload everything in this folder, keeping `fonts/` and `test/` as folders.
3. **Settings ▸ Pages ▸ Source: Deploy from a branch ▸ main ▸ / (root) ▸ Save.**
4. Wait a minute, then open the URL it gives you.
5. On each machine: shift-click **Sync**, paste the `/exec` URL and the token.
   That is stored in that browser and never in this repo.

## The endpoint

`apps-script/Sync.gs` is the source of what runs in the planner spreadsheet's
Apps Script, alongside `Publish.gs` — it calls that file's gradebook readers
rather than duplicating them. It is kept here so it is versioned and so the
tests can run its redaction directly; it holds no secrets, since the token
lives in Script Properties.

Students read it through `doGet` with no token: `…/exec?c=p1`. Everything
teacher-only is stripped server-side, never in the page.

After changing `Sync.gs`: **Deploy ▸ Manage deployments ▸** pencil **▸ Version:
New version ▸ Deploy.** The URL and token stay the same.

## Tests

    cd test
    npm install          # jsdom, once
    node run-all.js      # the audit, then every behaviour test
    node audit.js        # just the constraints

`audit.js` enforces what must never break: five weekday columns, absences and
private notes kept out of the student view, held links carrying no URL, student
names never written to the machine, no red/green pair, and nothing loaded from
the network. Keep it green.

## The student page

`agenda/` is what students open: `…/planner/agenda/?class=p1`, one URL per
class, in Schoology as a link or an iframe.

Set the endpoint once in `agenda/endpoint.js`. There is no token — the page
shows only what has been published, and the endpoint has already removed
everything students may not see. The page cannot turn text into a link: a span
becomes an anchor only if it arrived carrying a url.

Publishing is `Planner sync ▸ Publish to students now`, or every 15 minutes with
the trigger on. Students see through the Friday of the current week, and the
week turns over at 5am on Monday.

Layout is date, block, class work, homework across the page — Chromebook
screens are wide, and a single column wasted most of one. It stacks below
52rem. The band at the top is the `Student Links` tab, which `Publish.gs`
already maintains; the endpoint reads it and hands each class its own links
plus anything marked ALL.

## How a student page loads

Fastest first:

1. **What this browser saw last time**, drawn immediately with no network at all.
2. **`feed/p1.json`** — a static file in this repo, beside the page, served by
   GitHub's CDN. Written by `publish()` through the GitHub API.
3. **The endpoint**, only if the static file is missing.

Step 2 is why this is quick. Apps Script takes one to three seconds to wake
before it does any work, and a page that waits on it can never feel fast. The
static file removes it from the student's path completely.

Set it up with `Planner sync ▸ Set GitHub token` — a fine-grained token with
Contents: read and write on that one repo. Without it, students fall back to
step 3 and everything still works, just slowly. `Check health` says which.

A colleague link always goes to the endpoint: the static feed is the student
one and carries none of my notes, and the secret must never be sent to a CDN.

## Two front doors

The school blocks `github.io` on student Chromebooks. So the same agenda is
served two ways:

| | |
|---|---|
| `duxphys.github.io/planner/agenda/?class=p1` | the page fetches JSON |
| `…/exec?class=p1&page=1` | the endpoint returns the finished page |

The second is `script.google.com`, which the school cannot block without
breaking Workspace. It is plain HTML with inline CSS — no fetch, no font file,
no cache stamp — so it also works with JavaScript off. Use it in Schoology now;
switch to the GitHub link if the block is ever lifted, or keep both.

**Both consume the same redacted payload.** `readPublished()` and `staffFeed()`
decide what a student may see; the two renderers only turn that into markup. A
held link cannot leak through one and not the other. Each renderer also refuses
private lines and held URLs on its own account, so a bug upstream cannot put one
in front of a student.

The two pages lay out identically — the served CSS mirrors `agenda.css`. Two
things differ:

- **Typeface.** GitHub gets Source Sans 3; the served page uses the system font
  (Roboto on a Chromebook). Apps Script cannot serve a `.woff2`, and 60KB of
  base64 per load would give back the speed the served page exists for.
- **How they refresh.** The GitHub page rechecks the feed when a tab comes back
  to the front and redraws only if the publish timestamp moved. The served page
  reloads itself instead, and only when the tab has been away five minutes —
  cruder, but there is no JSON to compare against and nothing to redraw from.

The served page is the faster of the two by construction: one request returning
finished HTML, versus a shell plus fonts plus a second request that cannot start
until the first finishes. Its plan is in the HTML, so it also works with
JavaScript turned off; the only script on it is the reload.

## The colleague view

`Planner sync ▸ Colleague link` gives a second, read-only secret. Added to an
agenda address — `…/agenda/?class=p1&k=…` — it opens the whole year instead of
the published weeks, with unreleased links working, private lines and `(( ))`
runs visible, and my day notes shown. Never absences: those are student names,
and a teacher at another school has no business with them.

It is link security, not identity. Apps Script cannot know who is visiting
while also reading my spreadsheet, so this is exactly as private as an unlisted
document — the risk is a student being *given* the link. It is a separate token
from the write one, so `New colleague link` revokes it without disturbing the
machines I write from.

## Refactoring the renderer

`node test/golden.js` writes every rendered state to `/tmp/golden.txt` — 216 of
them, across both views, three widths, three colour modes, student and teacher,
prep shown and hidden, at three window positions. Run it before and after a
structural change and diff the two. Identical output means nothing visible
moved. It is not part of `run-all.js`, because a markup snapshot would fail on
every intentional change to the UI.

## Not done yet

- The student page: published JSON, one page per class.
- The one-time import from the sheet — must run inside Apps Script against the
  live rich text, since an `.xlsx` export drops most of the links.
- Reading `Courses` and `Build Calendar`, so `data.js` stops being hardcoded.
  Until then the calendar ends where the sheet's built weeks end.
