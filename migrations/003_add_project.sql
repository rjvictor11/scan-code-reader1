-- Run this once in the Supabase SQL Editor, after 001 and 002.
-- Adds a project column so scans from different projects (WS, DT, ...) stay
-- separate: history, the duplicate check, and the CSV report are all
-- scoped to whichever project is currently selected in the app.

alter table label_scans add column if not exists project text;

-- Backfill any existing rows (there shouldn't be real production data yet,
-- but this keeps the migration safe to run regardless) before the column
-- can be made required.
update label_scans set project = 'WS' where project is null;

alter table label_scans alter column project set not null;

alter table label_scans drop constraint if exists label_scans_project_check;
alter table label_scans add constraint label_scans_project_check
  check (project in ('WS', 'DT'));

create index if not exists label_scans_project_idx on label_scans (project);

-- The duplicate-code and raw_code lookups are now always scoped to one
-- project too, so a composite index serves those better than the plain
-- raw_code index from 002 alone.
create index if not exists label_scans_project_raw_code_idx on label_scans (project, raw_code);
