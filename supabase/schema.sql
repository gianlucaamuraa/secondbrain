-- Second Brain: schema del database.
-- Da eseguire in Supabase > SQL Editor > New query > Run.
-- Si può rieseguire senza problemi: aggiorna anche un database creato con una versione precedente
-- (i dati esistenti finiscono nello spazio "Personale" del loro proprietario).

/* ---------- utenti e spazi di lavoro ---------- */

-- Nome visualizzato di ogni utente.
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null default '',
  name text not null default '',
  created_at timestamptz not null default now()
);

-- Spazio di lavoro: "Personale" (uno per utente) oppure condiviso.
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  personal boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists workspaces_one_personal on public.workspaces (created_by) where personal;

-- Persone di uno spazio. Tre casi:
--   user_id valorizzato           → utente con account
--   solo email                    → invito in attesa (diventa utente al primo accesso con quella email)
--   né user_id né email (solo nome) → persona senza account, serve solo per taggarla
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id uuid references auth.users on delete set null,
  email text,
  name text not null default '',
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now()
);
create unique index if not exists members_user_uq on public.members (workspace_id, user_id) where user_id is not null;
create unique index if not exists members_email_uq on public.members (workspace_id, lower(email)) where email is not null;
create index if not exists members_user_idx on public.members (user_id);
create index if not exists members_email_idx on public.members (lower(email));

/* ---------- enti, argomenti, note ---------- */

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users on delete set null,
  workspace_id uuid references public.workspaces on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users on delete set null,
  workspace_id uuid references public.workspaces on delete cascade,
  entity_id uuid not null references public.entities on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  last_activity timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users on delete set null, -- autore
  workspace_id uuid references public.workspaces on delete cascade,
  topic_id uuid not null references public.topics on delete cascade,
  html text not null default '',
  text text not null default '',
  todo boolean not null default false,
  done boolean not null default false,
  due_date date,
  mentions uuid[] not null default '{}', -- persone taggate (id di public.members)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- aggiornamento di database creati con versioni precedenti
alter table public.notes add column if not exists due_date date;
alter table public.notes add column if not exists mentions uuid[] not null default '{}';
alter table public.entities add column if not exists workspace_id uuid references public.workspaces on delete cascade;
alter table public.topics   add column if not exists workspace_id uuid references public.workspaces on delete cascade;
alter table public.notes    add column if not exists workspace_id uuid references public.workspaces on delete cascade;
-- se un utente viene eliminato, i suoi contributi negli spazi condivisi restano
alter table public.entities alter column user_id drop not null;
alter table public.topics   alter column user_id drop not null;
alter table public.notes    alter column user_id drop not null;
alter table public.entities drop constraint if exists entities_user_id_fkey;
alter table public.topics   drop constraint if exists topics_user_id_fkey;
alter table public.notes    drop constraint if exists notes_user_id_fkey;
alter table public.entities add constraint entities_user_id_fkey foreign key (user_id) references auth.users on delete set null;
alter table public.topics   add constraint topics_user_id_fkey   foreign key (user_id) references auth.users on delete set null;
alter table public.notes    add constraint notes_user_id_fkey    foreign key (user_id) references auth.users on delete set null;

/* ---------- funzioni di controllo (usate dalle regole di accesso) ---------- */

create or replace function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where workspace_id = ws and user_id = auth.uid());
$$;

create or replace function public.is_owner(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where workspace_id = ws and user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.shares_workspace(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members a join members b on a.workspace_id = b.workspace_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

/* ---------- trigger ---------- */

-- chi crea uno spazio ne diventa proprietario
create or replace function public.ws_add_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into members (workspace_id, user_id, email, name, role)
  values (new.id, new.created_by, (select email from auth.users where id = new.created_by), '', 'owner')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists workspaces_add_owner on public.workspaces;
create trigger workspaces_add_owner after insert on public.workspaces
  for each row execute function public.ws_add_owner();

-- un ente senza spazio indicato va nello spazio personale di chi lo crea
create or replace function public.entity_default_ws() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.workspace_id is null then
    select id into new.workspace_id from workspaces where created_by = auth.uid() and personal;
  end if;
  return new;
end $$;
drop trigger if exists entities_default_ws on public.entities;
create trigger entities_default_ws before insert on public.entities
  for each row execute function public.entity_default_ws();

-- argomenti e note prendono lo spazio dall'ente / dall'argomento
create or replace function public.topic_set_ws() returns trigger language plpgsql as $$
begin
  new.workspace_id := (select workspace_id from public.entities where id = new.entity_id);
  return new;
end $$;
drop trigger if exists topics_set_ws on public.topics;
create trigger topics_set_ws before insert or update of entity_id on public.topics
  for each row execute function public.topic_set_ws();

create or replace function public.note_set_ws() returns trigger language plpgsql as $$
begin
  new.workspace_id := (select workspace_id from public.topics where id = new.topic_id);
  return new;
end $$;
drop trigger if exists notes_set_ws on public.notes;
create trigger notes_set_ws before insert or update of topic_id on public.notes
  for each row execute function public.note_set_ws();

-- ente spostato in un altro spazio: si spostano anche argomenti e note
create or replace function public.entity_move_ws() returns trigger language plpgsql as $$
begin
  update public.topics set workspace_id = new.workspace_id where entity_id = new.id;
  update public.notes set workspace_id = new.workspace_id
    where topic_id in (select id from public.topics where entity_id = new.id);
  return new;
end $$;
drop trigger if exists entities_move_ws on public.entities;
create trigger entities_move_ws after update of workspace_id on public.entities
  for each row when (new.workspace_id is distinct from old.workspace_id)
  execute function public.entity_move_ws();

/* ---------- dati esistenti: spazio personale per ogni utente ---------- */

do $$
declare u record; ws uuid;
begin
  for u in select id, email from auth.users loop
    insert into public.profiles (id, email) values (u.id, coalesce(u.email, '')) on conflict (id) do nothing;
    ws := null;
    select id into ws from public.workspaces where created_by = u.id and personal;
    if ws is null then
      insert into public.workspaces (name, personal, created_by) values ('Personale', true, u.id) returning id into ws;
    end if;
    update public.entities set workspace_id = ws where workspace_id is null and user_id = u.id;
  end loop;
  update public.topics t set workspace_id = e.workspace_id
    from public.entities e where t.entity_id = e.id and t.workspace_id is null;
  update public.notes n set workspace_id = t.workspace_id
    from public.topics t where n.topic_id = t.id and n.workspace_id is null;
end $$;

alter table public.entities alter column workspace_id set not null;
alter table public.topics   alter column workspace_id set not null;
alter table public.notes    alter column workspace_id set not null;

create index if not exists entities_ws_idx on public.entities (workspace_id);
create index if not exists topics_entity_idx on public.topics (entity_id);
create index if not exists notes_topic_idx on public.notes (topic_id, created_at);
create index if not exists notes_ws_idx on public.notes (workspace_id);
create index if not exists notes_mentions_idx on public.notes using gin (mentions);
drop index if exists public.notes_todo_idx;
drop index if exists public.notes_due_idx;
create index if not exists notes_todo_ws_idx on public.notes (workspace_id) where todo and not done;
create index if not exists notes_due_ws_idx on public.notes (workspace_id, due_date) where todo;

/* ---------- avvio della sessione (chiamata dall'app a ogni accesso) ---------- */
-- crea profilo e spazio personale se mancano, e accetta gli inviti arrivati alla propria email
create or replace function public.bootstrap() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); my_email text; ws uuid;
begin
  if me is null then return; end if;
  select email into my_email from auth.users where id = me;
  insert into profiles (id, email) values (me, coalesce(my_email, ''))
    on conflict (id) do update set email = excluded.email;
  select id into ws from workspaces where created_by = me and personal;
  if ws is null then
    insert into workspaces (name, personal, created_by) values ('Personale', true, me);
  end if;
  update members m set user_id = me
    where m.user_id is null and m.email is not null and lower(m.email) = lower(my_email)
      and not exists (select 1 from members x where x.workspace_id = m.workspace_id and x.user_id = me);
end $$;
revoke all on function public.bootstrap() from public, anon;
grant execute on function public.bootstrap() to authenticated;

/* ---------- registrazione solo su invito ---------- */
-- Ci si può registrare (o essere creati dal pannello di Supabase) solo con un'email
-- che è stata invitata in uno spazio. Il primo utente in assoluto è sempre ammesso.
create or replace function public.only_invited() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from auth.users) and not exists (
    select 1 from public.members where email is not null and lower(email) = lower(new.email)
  ) then
    raise exception 'Questa email non è stata invitata in nessuno spazio';
  end if;
  return new;
end $$;
drop trigger if exists only_invited_signup on auth.users;
create trigger only_invited_signup before insert on auth.users
  for each row execute function public.only_invited();

/* ---------- regole di accesso ---------- */
-- Si vedono e modificano solo i dati degli spazi di cui si fa parte.

alter table public.profiles   enable row level security;
alter table public.workspaces enable row level security;
alter table public.members    enable row level security;
alter table public.entities   enable row level security;
alter table public.topics     enable row level security;
alter table public.notes      enable row level security;

drop policy if exists own_entities on public.entities;
drop policy if exists own_topics   on public.topics;
drop policy if exists own_notes    on public.notes;
drop policy if exists ws_entities  on public.entities;
drop policy if exists ws_topics    on public.topics;
drop policy if exists ws_notes     on public.notes;
create policy ws_entities on public.entities for all to authenticated
  using (is_member(workspace_id)) with check (is_member(workspace_id));
create policy ws_topics on public.topics for all to authenticated
  using (is_member(workspace_id)) with check (is_member(workspace_id));
create policy ws_notes on public.notes for all to authenticated
  using (is_member(workspace_id)) with check (is_member(workspace_id));

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or shares_workspace(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from authenticated, anon;
grant update (name) on public.profiles to authenticated;

drop policy if exists workspaces_select on public.workspaces;
drop policy if exists workspaces_insert on public.workspaces;
drop policy if exists workspaces_update on public.workspaces;
drop policy if exists workspaces_delete on public.workspaces;
create policy workspaces_select on public.workspaces for select to authenticated
  using (is_member(id) or created_by = auth.uid());
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (created_by = auth.uid() and not personal);
create policy workspaces_update on public.workspaces for update to authenticated
  using (is_owner(id)) with check (is_owner(id));
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (is_owner(id) and not personal);
revoke update on public.workspaces from authenticated, anon;
grant update (name) on public.workspaces to authenticated;

drop policy if exists members_select on public.members;
drop policy if exists members_insert on public.members;
drop policy if exists members_update on public.members;
drop policy if exists members_delete on public.members;
create policy members_select on public.members for select to authenticated
  using (is_member(workspace_id) or user_id = auth.uid());
-- nello spazio personale si aggiungono solo persone senza account (da taggare)
create policy members_insert on public.members for insert to authenticated
  with check (is_owner(workspace_id) and (email is null or not exists (
    select 1 from public.workspaces w where w.id = workspace_id and w.personal)));
create policy members_update on public.members for update to authenticated
  using (is_owner(workspace_id)) with check (is_owner(workspace_id));
-- il proprietario toglie gli altri; chi non è proprietario può uscire da solo
create policy members_delete on public.members for delete to authenticated
  using ((is_owner(workspace_id) and user_id is distinct from auth.uid())
      or (user_id = auth.uid() and role <> 'owner'));
revoke insert, update on public.members from authenticated, anon;
grant insert (workspace_id, email, name, role) on public.members to authenticated;
grant update (name, role) on public.members to authenticated;

/* ---------- archivio file (immagini e allegati) ---------- */
-- Ognuno carica nella propria cartella. Un file si può aprire se è tuo
-- oppure se compare in una nota di uno spazio di cui fai parte.
insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do nothing;

create or replace function public.can_use_file(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select split_part(path, '/', 1) = auth.uid()::text
    or exists (
      select 1 from notes n join members m on m.workspace_id = n.workspace_id and m.user_id = auth.uid()
      where position(path in n.html) > 0
    );
$$;

drop policy if exists files_select on storage.objects;
drop policy if exists files_insert on storage.objects;
drop policy if exists files_update on storage.objects;
drop policy if exists files_delete on storage.objects;
create policy files_select on storage.objects for select to authenticated
  using (bucket_id = 'files' and public.can_use_file(name));
create policy files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy files_update on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and public.can_use_file(name));
