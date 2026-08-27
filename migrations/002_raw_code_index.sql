-- Run this once in the Supabase SQL Editor, after 001.
-- Backs the duplicate-code check in the app (js/app.js checkForDuplicate),
-- which looks up label_scans by raw_code on every scan.

create index if not exists label_scans_raw_code_idx on label_scans (raw_code);
