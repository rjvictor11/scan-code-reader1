-- Run this once in the Supabase SQL Editor.
-- One row per physical scan (old-format or new-format label). Two rows that
-- describe the same part are linked by sharing a correlation_id -- either
-- because they were scanned back-to-back in "Pair" mode, or linked later
-- from the history list once the matching label turns up.

create table if not exists label_scans (
  id              bigint generated always as identity primary key,
  correlation_id  uuid not null default gen_random_uuid(),
  label_version   text not null default 'old' check (label_version in ('old', 'new')),
  raw_code        text not null,
  ebom            text,
  traceability    text,
  scanned_at      timestamptz not null default now()
);

create index if not exists label_scans_correlation_id_idx on label_scans (correlation_id);
create index if not exists label_scans_ebom_idx on label_scans (ebom);
create index if not exists label_scans_traceability_idx on label_scans (traceability);
create index if not exists label_scans_scanned_at_idx on label_scans (scanned_at desc);

-- Open access (no login in this app) -- the anon key can read, insert,
-- update (used only to attach a correlation_id when linking two scans made
-- at different times), and delete (used only for the "Undo" button right
-- after a save). The anon key is safe to expose client-side per Supabase's
-- model, but with these policies anyone holding it can read/write every row
-- here, not just "their own" -- there's no per-user scoping since there's
-- no login. Tighten this later (e.g. require auth like harness-toolkit's
-- admin.html magic-link sign-in, and scope policies to `authenticated`
-- only) if that becomes a concern.
alter table label_scans enable row level security;

drop policy if exists "anon can read label scans" on label_scans;
create policy "anon can read label scans" on label_scans
  for select
  to anon, authenticated
  using (true);

drop policy if exists "anon can insert label scans" on label_scans;
create policy "anon can insert label scans" on label_scans
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "anon can update label scans" on label_scans;
create policy "anon can update label scans" on label_scans
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "anon can delete label scans" on label_scans;
create policy "anon can delete label scans" on label_scans
  for delete
  to anon, authenticated
  using (true);
