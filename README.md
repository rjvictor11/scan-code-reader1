# Label Scan Correlator

A camera-based scanner for part labels (Data Matrix, QR, Code128). Scans
happen in pairs — the old-format label and its new-format replacement,
one right after the other — and both save to Supabase, timestamped, under
a shared `correlation_id` so you can trace one back to the other.

Plain HTML/CSS/JS, no build step, no npm. Open `index.html` through any
static file server (or GitHub Pages) and it runs.

## How it reads labels

Codes are expected to look like:

```
P<EBOM>-<Traceability>
e.g. P68579358AB-T05WH269300041
```

`js/app.js` splits on the first `-` after the leading `P` to get the EBOM
and traceability fields (`CODE_PATTERN` near the top of the file). The
labels are changing to a new, not-yet-known format — anything that doesn't
match this pattern is still saved in full (`raw_code`), just without
parsed `ebom`/`traceability` fields, so nothing is lost once the new format
shows up.

The scanner itself tries Data Matrix, QR, and Code128 per frame
(`SCAN_FORMATS` in `js/app.js`). If the new label turns out to use a
different symbology, add it to that array — see the full list in
[`Html5QrcodeSupportedFormats`](https://github.com/mebjas/html5-qrcode).

## Correlating old ↔ new labels

Every scan is part of a pair: scan the old label, then its new-label
replacement, right after each other. Both save under the same
`correlation_id`, and the "1. Old label → 2. New label" indicator at the
top of the Scan card tracks which half you're on. There's no way to save
a scan on its own — the app always expects the other half next.

The Recent scans list groups rows by `correlation_id`, showing the old and
new side by side once both exist.

**If a pairing gets interrupted** (closed the app after scanning the old
label but before its match arrived, or hit Undo on the old half after
already moving on) — that scan sits in "Waiting to be linked" until you
click **Link…** on it, search, and pick its match whenever it does turn
up. That's a recovery path for the exception, not a second way to work
normally.

The preview also blocks one specific mistake: scanning a code that's
*exactly* the same as one already saved in the current project —
anywhere, not just this session, and regardless of which side (old or
new) it was saved as the first time. A physical label should only ever
get scanned once, so any exact repeat almost always means the same
label got scanned twice instead of its actual match. This is checked
against the database live (`checkForDuplicate` in `js/app.js`), not
just against what's in this browser tab — Save stays disabled while
the check is running and stays disabled if it finds one; Discard &
rescan is the only way past it. If the check itself fails (e.g. a
network hiccup), it fails closed too — Save stays blocked with a Retry
button rather than letting an unverified scan through. Two units of
the same part number sharing an EBOM is completely normal, though —
the check is on the raw code, never on EBOM alone.

If a duplicate (or any other bad row) does end up saved, **Delete** next
to **Link…** in "Waiting to be linked" removes it permanently — the only
built-in way to remove a scan that's more than a few seconds old (past
the Undo window).

## Projects

The **Project** selector at the top of the page scopes *everything* to
whichever one is active: the Recent scans list, the duplicate check, the
CSV report, and "Download report" all only see that project's rows — a
code existing under two different projects is normal, not a duplicate.
The choice is remembered in this browser (`localStorage`) so it doesn't
need reselecting each visit; a fresh browser with nothing stored yet
defaults to `WS`. **Download all** (next to Download report) is the one place
that ignores the selector on purpose — it exports every project combined
into a single file.

The selectable list is the `PROJECTS` array in `js/app.js`, matched by the
`<option>`s in `index.html` — hardcoded on purpose, not read from the
database. Activating a project is a code change + push, never a Supabase
visit: [`migrations/004_projects_table.sql`](migrations/004_projects_table.sql)
already seeded `WS`, `DT`, `WL`, `JL`, `JT`, and `WD` as rows in a
`projects` table, so `label_scans.project`'s foreign key already accepts
any of the six — only which of them `PROJECTS`/the dropdown currently
lists controls what's actually selectable. To add one already reserved
there (`WL`, `JL`, `JT`, `WD`) or a genuinely new code, add it to both
`PROJECTS` in `js/app.js` and the `<option>` list in `index.html`; a
brand-new code also needs a row inserted into `projects` first (one line
of SQL, run once) so the foreign key accepts it.

Switching the selector mid-scan discards whatever's in the preview and
resets the old/new pairing in progress — a pending Save was only checked
for duplicates against the project you were on, and an old/new pair
can't have its two halves end up filed under different projects.

## Using a handheld barcode scanner (instead of, or with, a phone camera)

A USB or Bluetooth handheld scanner acts like a keyboard — it types the
decoded text wherever the cursor is, then hits Enter. The **Manual entry**
field is built for that: it's focused by default, and re-focused after
every save, undo, and discard, so you can keep scanning back-to-back
without touching the screen between scans. It only loses focus while a
scan is sitting in the preview waiting for you to hit Save or Discard —
that pause is intentional, so a misread doesn't get written before you
see it.

The phone camera ("Start camera") works the same way otherwise, and both
can be used interchangeably scan to scan.

## Downloading a report

**Download report** (top of the Recent scans card) exports the current
project as a CSV — one row per part (old and new label side by side,
`linked` yes/no), not one row per scan. If there's text in the search
box, the export is filtered the same way the on-screen list is; clear
the search first for the full history. **Download all** next to it
exports every project combined into one file instead (still tagged
per-row by `project`), regardless of which one is currently selected.
Both page through the full result set, so neither one silently
truncates once a project has scanned past Supabase's per-request row
cap.

## Setup

1. **Database** — this has its own dedicated Supabase project (separate from
   harness-toolkit's). Open its SQL Editor and run, in order, once each:
   [`migrations/001_label_scans.sql`](migrations/001_label_scans.sql),
   [`migrations/002_raw_code_index.sql`](migrations/002_raw_code_index.sql),
   [`migrations/003_add_project.sql`](migrations/003_add_project.sql), and
   [`migrations/004_projects_table.sql`](migrations/004_projects_table.sql).
   `js/supabase-client.js` already has that project's URL/anon key filled
   in — nothing else to configure.
2. **Run it** — any static file server works, e.g.:
   ```
   npx serve .
   # or
   python3 -m http.server 8000
   ```
   Then open `http://localhost:...`. Camera access requires a "secure
   context" — `localhost` counts as one even over plain HTTP, but testing
   from a phone over your LAN IP (`http://192.168.x.x:8000`) will not get
   camera permission. For real phone testing, deploy it (see below) or use
   an HTTPS tunnel.
3. **Deploy** (optional) — push to GitHub and enable Pages (Settings →
   Pages → Deploy from branch), same as the rest of the toolkit. Any static
   host works equally well (Netlify, Vercel, Cloudflare Pages, etc.) since
   there's no build step.

## Access & security notes

This app has **no login** — anyone with the URL can scan and save, by
design (open access, for quick shop-floor use on shared devices). That
means the Supabase policies in the migration grant the `anon` key full
read/write/delete on `label_scans`; there's no per-user scoping. If this
data needs to be locked down later, add sign-in (see `admin.html`'s
magic-link flow in `harness-toolkit` for a pattern to copy) and change the
policies in `migrations/001_label_scans.sql` to `to authenticated` only.

The "Undo" button after a save, and "Delete" on an unpaired scan, are
single-row cleanup tools — there's no bulk-delete UI.

The app's anon key never reads or writes `projects` at all — that table
exists purely to satisfy `label_scans`' foreign key (see Projects above).
Activating or adding a project is a code change in this repo, not
something done through the app's own UI or the anon key.

## Files

```
index.html              the whole UI
js/app.js                scanning, parsing, saving, correlation logic
js/supabase-client.js    Supabase project URL/anon key + client
js/theme.js              dark/light mode toggle
vendor/html5-qrcode.min.js   scanning library (Apache-2.0, vendored so it works offline/without a CDN)
migrations/001_label_scans.sql   table + RLS policies
migrations/002_raw_code_index.sql   index backing the duplicate check
migrations/003_add_project.sql   project column and a composite index (its check constraint is later replaced by 004's foreign key)
migrations/004_projects_table.sql   projects table so label_scans' foreign key accepts WS/DT/WL/JL/JT/WD -- the app's own PROJECTS list (js/app.js) is what actually controls the dropdown
```
