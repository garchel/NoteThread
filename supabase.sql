-- NoteThread — Supabase schema (free tier)
-- Rodar no SQL Editor do Supabase. Ativa Realtime e RLS por usuário (auth.uid()).

-- 1. Tabelas
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  created_at timestamptz default now()
);

create table if not exists folders (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id text,
  emoji text,
  created_at timestamptz default now()
);

create table if not exists threads (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text,
  folder_id text references folders(id) on delete set null,
  favorite boolean default false,
  pinned_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_preview text,
  ordering integer default 0
);

create table if not exists notes (
  client_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id text not null references threads(id) on delete cascade,
  text text,
  images jsonb default '[]'::jsonb,
  tags text[] default '{}',
  ts bigint not null,
  sort_order integer,
  edited boolean default false,
  edited_at bigint,
  rev integer default 0,
  created_at timestamptz default now()
);

-- 2. RLS
alter table profiles enable row level security;
alter table folders enable row level security;
alter table threads enable row level security;
alter table notes enable row level security;

drop policy if exists "own profiles" on profiles;
create policy "own profiles" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own folders" on folders;
create policy "own folders" on folders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own threads" on threads;
create policy "own threads" on threads for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own notes" on notes;
create policy "own notes" on notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Realtime (supabase realtime precisa publication)
alter publication supabase_realtime add table threads;
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table folders;

-- 4. Índices
create index if not exists notes_thread_ts on notes(thread_id, ts);
create index if not exists threads_user_updated on threads(user_id, updated_at desc);
