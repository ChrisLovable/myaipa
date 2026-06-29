-- Calls / SMS log table
create table if not exists public.calls_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users on delete cascade not null,
  call_type text not null check (call_type in ('outbound', 'sms')),
  to_number text not null,
  from_number text not null,
  message text,
  twilio_sid text,
  status text,
  created_at timestamptz not null default now()
);

alter table public.calls_log enable row level security;

create policy "Users can view own call logs"
  on public.calls_log for select
  using (auth.uid() = user_id);

create policy "Users can insert own call logs"
  on public.calls_log for insert
  with check (auth.uid() = user_id);
