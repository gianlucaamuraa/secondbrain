-- Second Brain: schema del database.
-- Da eseguire una volta in Supabase > SQL Editor > New query > Run.

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Niente enti doppi: due nomi uguali a meno di maiuscole e spazi sono lo stesso ente.
-- Se ci sono già doppioni, i loro argomenti passano all'ente creato per primo
-- e i doppioni (ormai vuoti) vengono eliminati. Nessuna nota va persa.
do $$
declare d record;
begin
  for d in
    select id, first_value(id) over w as keep_id
    from public.entities
    window w as (partition by user_id, lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))
                 order by created_at, id)
  loop
    if d.id <> d.keep_id then
      update public.topics set entity_id = d.keep_id where entity_id = d.id;
      delete from public.entities where id = d.id;
    end if;
  end loop;
exception when undefined_table then null;  -- prima installazione: tabella topics non ancora creata
end $$;
update public.entities set name = btrim(regexp_replace(name, '\s+', ' ', 'g'))
  where name <> btrim(regexp_replace(name, '\s+', ' ', 'g'));
create unique index if not exists entities_unique_name
  on public.entities (user_id, lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))));

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  entity_id uuid not null references public.entities on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  last_activity timestamptz not null default now()
);
create index if not exists topics_entity_idx on public.topics (entity_id);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  topic_id uuid not null references public.topics on delete cascade,
  html text not null default '',
  text text not null default '',
  todo boolean not null default false,
  done boolean not null default false,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- per chi aveva già creato la tabella prima delle scadenze
alter table public.notes add column if not exists due_date date;
create index if not exists notes_topic_idx on public.notes (topic_id, created_at);
create index if not exists notes_todo_idx on public.notes (user_id) where todo and not done;
create index if not exists notes_due_idx on public.notes (user_id, due_date) where todo;

-- Ognuno vede e modifica solo i propri dati.
alter table public.entities enable row level security;
alter table public.topics   enable row level security;
alter table public.notes    enable row level security;

drop policy if exists own_entities on public.entities;
drop policy if exists own_topics   on public.topics;
drop policy if exists own_notes    on public.notes;
create policy own_entities on public.entities for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_topics on public.topics for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_notes on public.notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Archivio file privato (immagini e allegati), una cartella per utente.
insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do nothing;

drop policy if exists files_select on storage.objects;
drop policy if exists files_insert on storage.objects;
drop policy if exists files_update on storage.objects;
drop policy if exists files_delete on storage.objects;
create policy files_select on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy files_update on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
