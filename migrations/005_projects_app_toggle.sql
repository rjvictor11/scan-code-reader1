-- Run this once in the Supabase SQL Editor, after 004.
-- Lets the app itself manage projects (a small "Manage projects" page,
-- projects.html) -- activating a reserved code, or adding a brand-new
-- one, without opening Supabase's own dashboard. Same open-access model
-- already used for label_scans -- the anon key can write here. What
-- actually keeps "a bunch of people" out is projects.html's own password
-- prompt (a casual client-side gate, same pattern as gate.js -- not real
-- security, just keeps it out of reach of anyone who isn't looking for
-- it). No delete policy -- a project, once created, can be deactivated
-- but not removed from the app itself.

drop policy if exists "anon can toggle project active state" on projects;
create policy "anon can toggle project active state" on projects
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "anon can add projects" on projects;
create policy "anon can add projects" on projects
  for insert
  to anon, authenticated
  with check (true);
