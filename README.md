# Label Scan Correlator

A camera-based scanner for part labels (Data Matrix, QR, Code128). Every
scan is saved to Supabase with a timestamp, and two scans of the same part
— an old-format label and its new-format replacement — can be linked
together so you can trace one back to the other.

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

Two ways to link a pair, since in practice the replacement label for a
given part may not show up until a later batch:

- **Pair mode** (toggle at the top of the Scan card): scan the old label,
  then the new label, right after each other. Both are saved sharing one
  `correlation_id`.
- **Link…** on any single (unpaired) scan in the "Waiting to be linked"
  list: search and pick its match from the opposite label version,
  whenever it eventually gets scanned. This just updates that row's
  `correlation_id` to match.

The Recent scans list groups rows by `correlation_id`, showing the old and
new side by side once both exist.

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

**Download report** (top of the Recent scans card) exports everything as
a CSV — one row per part (old and new label side by side, `linked`
yes/no), not one row per scan. If there's text in the search box, the
export is filtered the same way the on-screen list is; clear the search
first for the full history.

## Setup

1. **Database** — this has its own dedicated Supabase project (separate from
   harness-toolkit's). Open its SQL Editor and run
   [`migrations/001_label_scans.sql`](migrations/001_label_scans.sql) once to
   create the `label_scans` table. `js/supabase-client.js` already has that
   project's URL/anon key filled in — nothing else to configure.
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

The "Undo" button after a save, and the delete policy backing it, exist
only to correct an obvious bad scan — there's no bulk-delete UI.

## Files

```
index.html              the whole UI
js/app.js                scanning, parsing, saving, correlation logic
js/supabase-client.js    Supabase project URL/anon key + client
js/theme.js              dark/light mode toggle
vendor/html5-qrcode.min.js   scanning library (Apache-2.0, vendored so it works offline/without a CDN)
migrations/001_label_scans.sql   table + RLS policies
```
