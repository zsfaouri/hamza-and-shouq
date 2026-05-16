create table if not exists public.hs_app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.hs_app_state to anon;
grant select, insert, update on public.hs_app_state to authenticated;

alter table public.hs_app_state enable row level security;

drop policy if exists "hs_app_state_select" on public.hs_app_state;
drop policy if exists "hs_app_state_insert" on public.hs_app_state;
drop policy if exists "hs_app_state_update" on public.hs_app_state;

create policy "hs_app_state_select"
  on public.hs_app_state
  for select
  to anon
  using (true);

create policy "hs_app_state_insert"
  on public.hs_app_state
  for insert
  to anon
  with check (true);

create policy "hs_app_state_update"
  on public.hs_app_state
  for update
  to anon
  using (true)
  with check (true);
