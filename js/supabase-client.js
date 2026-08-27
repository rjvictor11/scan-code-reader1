// Fill these in from your Supabase project: Settings -> API -> Project URL / anon public key.
// The anon key is safe to expose client-side -- Row Level Security is what actually gates access.
// This reuses the same Supabase project as the harness-toolkit repo, with its
// own dedicated `label_scans` table (see migrations/001_label_scans.sql) --
// unrelated to that repo's other tables.
const SUPABASE_URL = "https://wugfwrjpfttalvlxtwln.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_3swKQevHKBuEN7brZytuaA_-PKK1tB8";

const sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
