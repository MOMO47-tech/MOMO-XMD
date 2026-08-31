-- Run this once in Supabase SQL Editor.
create table if not exists public.whatsapp_sessions (
  session_key text primary key,
  session_data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_sessions enable row level security;

-- The bot uses the server-side service_role key, so no public policies are needed.
-- Never expose the service_role key to browser code or commit it to Git.
