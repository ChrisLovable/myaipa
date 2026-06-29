-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users Profile
create table if not exists public.users_profile (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  language text not null default 'af',
  company_name text,
  company_logo_url text,
  subscription_tier text not null default 'basic',
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now()
);

-- Conversations
create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Uploaded Files
create table if not exists public.uploaded_files (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users on delete cascade not null,
  file_name text not null,
  file_url text,
  file_type text,
  extracted_text text,
  created_at timestamptz not null default now()
);

-- Row Level Security
alter table public.users_profile enable row level security;
alter table public.conversations enable row level security;
alter table public.uploaded_files enable row level security;

-- RLS Policies: users_profile
create policy "Users can view own profile"
  on public.users_profile for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.users_profile for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.users_profile for update
  using (auth.uid() = id);

-- RLS Policies: conversations
create policy "Users can view own conversations"
  on public.conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert own conversations"
  on public.conversations for insert
  with check (auth.uid() = user_id);

-- RLS Policies: uploaded_files
create policy "Users can view own files"
  on public.uploaded_files for select
  using (auth.uid() = user_id);

create policy "Users can insert own files"
  on public.uploaded_files for insert
  with check (auth.uid() = user_id);

-- Storage Buckets (run via Supabase dashboard or CLI)
-- insert into storage.buckets (id, name, public) values ('logos', 'logos', true);
-- insert into storage.buckets (id, name, public) values ('uploads', 'uploads', false);

-- Storage policies for logos bucket
create policy "Users can upload their own logo"
  on storage.objects for insert
  with check (bucket_id = 'logos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Logos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'logos');

-- Storage policies for uploads bucket
create policy "Users can upload their own files"
  on storage.objects for insert
  with check (bucket_id = 'uploads' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can read their own uploads"
  on storage.objects for select
  using (bucket_id = 'uploads' and auth.uid()::text = (storage.foldername(name))[1]);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users_profile (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
