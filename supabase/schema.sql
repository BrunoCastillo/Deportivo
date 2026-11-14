-- =====================================================================
-- Rebote · Esquema de Supabase
-- Ejecutar completo en Supabase > SQL Editor > New query > Run.
-- Es idempotente: se puede volver a ejecutar sin perder datos.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Miembros de club y roles ----------
create table if not exists public.club_members (
  club_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','coach','scorer','player','fan')),
  email text,
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create table if not exists public.club_invites (
  code text primary key,
  club_id uuid not null,
  role text not null check (role in ('admin','coach','scorer','player','fan')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

-- ---------- Documentos (todas las entidades de la app) ----------
create table if not exists public.records (
  id uuid primary key,
  club_id uuid not null,
  kind text not null,          -- clubs, teams, players, games, events, ...
  game_id uuid,                -- solo para eventos (filtro de tiempo real)
  data jsonb not null,
  updated_at bigint not null,  -- reloj del cliente (last-write-wins)
  deleted boolean not null default false,
  updated_by uuid default auth.uid(),
  server_ts timestamptz not null default now()
);
create index if not exists records_club_ts on public.records (club_id, server_ts);
create index if not exists records_game on public.records (game_id);

-- ---------- Marcador público en vivo ----------
create table if not exists public.live_scores (
  game_id uuid primary key,
  club_id uuid not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- Funciones auxiliares ----------
create or replace function public.member_role(p_club uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.club_members where club_id = p_club and user_id = auth.uid()
$$;

create or replace function public.can_write(p_club uuid, p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.member_role(p_club) = 'admin' then true
    when public.member_role(p_club) = 'coach' then p_kind <> 'clubs'
    when public.member_role(p_club) = 'scorer' then p_kind in ('games','events','opponents')
    else false end
$$;

-- server_ts siempre del servidor (cursor de sincronización fiable)
create or replace function public.touch_server_ts()
returns trigger language plpgsql as $$
begin
  new.server_ts := now();
  return new;
end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
for each row execute function public.touch_server_ts();

-- Quien crea un club queda como administrador
create or replace function public.bootstrap_club()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'clubs' and new.id = new.club_id then
    insert into public.club_members (club_id, user_id, role, email)
    values (new.club_id, auth.uid(), 'admin', (select email from auth.users where id = auth.uid()))
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists records_bootstrap on public.records;
create trigger records_bootstrap after insert on public.records
for each row execute function public.bootstrap_club();

-- Unirse a un club con un código de invitación
create or replace function public.join_club(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.club_invites;
begin
  select * into inv from public.club_invites where code = upper(p_code) and expires_at > now();
  if inv is null then raise exception 'Código inválido o vencido'; end if;
  insert into public.club_members (club_id, user_id, role, email)
  values (inv.club_id, auth.uid(), inv.role, (select email from auth.users where id = auth.uid()))
  on conflict (club_id, user_id) do update set role = excluded.role;
  return inv.club_id;
end $$;

-- ---------- Seguridad (RLS) ----------
alter table public.records enable row level security;
alter table public.club_members enable row level security;
alter table public.club_invites enable row level security;
alter table public.live_scores enable row level security;

drop policy if exists rec_select on public.records;
create policy rec_select on public.records for select
  using (public.member_role(club_id) is not null);

drop policy if exists rec_insert on public.records;
create policy rec_insert on public.records for insert
  with check (
    public.can_write(club_id, kind)
    or (kind = 'clubs' and id = club_id and auth.uid() is not null
        and not exists (select 1 from public.club_members m where m.club_id = records.club_id))
  );

drop policy if exists rec_update on public.records;
create policy rec_update on public.records for update
  using (public.can_write(club_id, kind))
  with check (public.can_write(club_id, kind));

drop policy if exists mem_select on public.club_members;
create policy mem_select on public.club_members for select
  using (user_id = auth.uid() or public.member_role(club_id) is not null);

drop policy if exists mem_admin on public.club_members;
create policy mem_admin on public.club_members for all
  using (public.member_role(club_id) = 'admin')
  with check (public.member_role(club_id) = 'admin');

drop policy if exists inv_admin on public.club_invites;
create policy inv_admin on public.club_invites for all
  using (public.member_role(club_id) in ('admin','coach'))
  with check (public.member_role(club_id) in ('admin','coach'));

drop policy if exists live_read on public.live_scores;
create policy live_read on public.live_scores for select using (true);

drop policy if exists live_write on public.live_scores;
create policy live_write on public.live_scores for insert
  with check (public.can_write(club_id, 'games'));
drop policy if exists live_update on public.live_scores;
create policy live_update on public.live_scores for update
  using (public.can_write(club_id, 'games'));
drop policy if exists live_delete on public.live_scores;
create policy live_delete on public.live_scores for delete
  using (public.can_write(club_id, 'games'));

-- ---------- Tiempo real ----------
do $$ begin
  begin alter publication supabase_realtime add table public.records; exception when others then null; end;
  begin alter publication supabase_realtime add table public.live_scores; exception when others then null; end;
end $$;
