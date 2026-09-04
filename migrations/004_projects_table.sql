-- Run this once in the Supabase SQL Editor, after 001, 002, and 003.
-- Replaces the fixed WS/DT check constraint with a proper projects table,
-- so a new project can be added -- or an existing one hidden -- by editing
-- this table directly in Supabase's Table Editor. No migration or app
-- redeploy needed for that going forward. Only "active" projects show up
-- in the app's dropdown; inactive ones stay in the database, reserved for
-- whenever they're needed.

create table if not exists projects (
  code       text primary key,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

insert into projects (code, active) values
  ('WS', true),
  ('DT', true),
  -- Reserved: exist in the database so they can be activated later with a
  -- one-line update (or by editing this table's active column directly in
  -- Table Editor), but stay out of the app's dropdown until then.
  ('WL', false),
  ('JL', false),
  ('JT', false),
  ('WD', false)
on conflict (code) do nothing;

-- Swap the fixed check constraint (003) for a foreign key -- any project a
-- scan references must exist here, active or not.
alter table label_scans drop constraint if exists label_scans_project_check;
alter table label_scans drop constraint if exists label_scans_project_fk;
alter table label_scans add constraint label_scans_project_fk
  foreign key (project) references projects (code);

-- Read-only from the app. Add, rename, activate, or deactivate a project
-- by editing this table directly in Supabase's Table Editor, not through
-- the app itself -- no anon write policy is granted here on purpose.
alter table projects enable row level security;

drop policy if exists "anyone can read projects" on projects;
create policy "anyone can read projects" on projects
  for select
  to anon, authenticated
  using (true);
