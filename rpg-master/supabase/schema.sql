-- RPG Master: esquema inicial (MVP)
-- Execute no SQL Editor do seu projeto Supabase.

create extension if not exists pgcrypto;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'paused' check (status in ('active', 'paused')),
  accumulated_active_seconds bigint not null default 0 check (accumulated_active_seconds >= 0),
  last_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'player' check (role in ('master', 'player')),
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  level text,
  current_hp numeric not null default 100,
  max_hp numeric not null default 100,
  current_mana numeric not null default 0,
  max_mana numeric not null default 0,
  mana_regen_per_minute numeric not null default 0,
  last_mana_sync_active_seconds bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_hp >= 0 and current_hp >= 0 and current_hp <= max_hp),
  check (max_mana >= 0 and current_mana >= 0 and current_mana <= max_mana),
  check (mana_regen_per_minute >= 0)
);

create table if not exists public.character_permissions (
  character_id uuid not null references public.characters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  can_edit_attributes boolean not null default false,
  can_edit_inventory boolean not null default true,
  can_use_resources boolean not null default true,
  can_edit_techniques boolean not null default false,
  primary key (character_id, user_id)
);

create table if not exists public.character_resource_events (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  resource text not null check (resource in ('hp', 'mana', 'xp')),
  amount numeric not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists characters_campaign_id_idx on public.characters(campaign_id);
create index if not exists campaign_members_user_id_idx on public.campaign_members(user_id);
create index if not exists resource_events_character_id_idx on public.character_resource_events(character_id, created_at desc);

-- O criador da campanha também entra como mestre.
create or replace function public.add_campaign_owner_as_master()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.campaign_members(campaign_id, user_id, role)
  values (new.id, new.owner_id, 'master')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_campaign_owner_member on public.campaigns;
create trigger trg_campaign_owner_member
after insert on public.campaigns
for each row execute function public.add_campaign_owner_as_master();

-- Relógio autoritativo: acumula somente o tempo em que a campanha esteve ativa.
create or replace function public.toggle_campaign_clock(p_campaign_id uuid)
returns public.campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.campaigns;
begin
  select * into c
  from public.campaigns
  where id = p_campaign_id
  for update;

  if not found then
    raise exception 'Campanha não encontrada';
  end if;

  if c.owner_id <> auth.uid() and not exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign_id and user_id = auth.uid() and role = 'master'
  ) then
    raise exception 'Somente o mestre pode controlar o relógio';
  end if;

  if c.status = 'paused' then
    update public.campaigns
      set status = 'active', last_started_at = now(), updated_at = now()
      where id = p_campaign_id
      returning * into c;
  else
    update public.campaigns
      set accumulated_active_seconds =
            accumulated_active_seconds +
            greatest(0, floor(extract(epoch from (now() - last_started_at)))::bigint),
          status = 'paused',
          last_started_at = null,
          updated_at = now()
      where id = p_campaign_id
      returning * into c;
  end if;

  return c;
end;
$$;

alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.characters enable row level security;
alter table public.character_permissions enable row level security;
alter table public.character_resource_events enable row level security;

-- Campanhas: membros podem ver; somente dono/mestre altera.
create policy "campaign members can read" on public.campaigns
for select using (
  exists (select 1 from public.campaign_members m
          where m.campaign_id = id and m.user_id = auth.uid())
);

create policy "authenticated users create campaigns" on public.campaigns
for insert with check (owner_id = auth.uid());

create policy "masters update campaigns" on public.campaigns
for update using (
  exists (select 1 from public.campaign_members m
          where m.campaign_id = id and m.user_id = auth.uid() and m.role = 'master')
);

create policy "members read membership" on public.campaign_members
for select using (user_id = auth.uid() or exists (
  select 1 from public.campaign_members m
  where m.campaign_id = campaign_members.campaign_id
    and m.user_id = auth.uid() and m.role = 'master'
));

create policy "owners add campaign members" on public.campaign_members
for insert with check (exists (
  select 1 from public.campaigns c
  where c.id = campaign_id and c.owner_id = auth.uid()
));

create policy "members read characters" on public.characters
for select using (exists (
  select 1 from public.campaign_members m
  where m.campaign_id = campaign_id and m.user_id = auth.uid()
));

create policy "masters create characters" on public.characters
for insert with check (exists (
  select 1 from public.campaign_members m
  where m.campaign_id = campaign_id and m.user_id = auth.uid() and m.role = 'master'
));

create policy "masters or permitted players update characters" on public.characters
for update using (
  exists (select 1 from public.campaign_members m
          where m.campaign_id = campaign_id and m.user_id = auth.uid() and m.role = 'master')
  or owner_user_id = auth.uid()
);

create policy "members read character permissions" on public.character_permissions
for select using (user_id = auth.uid() or exists (
  select 1 from public.characters c
  join public.campaign_members m on m.campaign_id = c.campaign_id
  where c.id = character_id and m.user_id = auth.uid() and m.role = 'master'
));

create policy "masters manage character permissions" on public.character_permissions
for all using (exists (
  select 1 from public.characters c
  join public.campaign_members m on m.campaign_id = c.campaign_id
  where c.id = character_id and m.user_id = auth.uid() and m.role = 'master'
)) with check (exists (
  select 1 from public.characters c
  join public.campaign_members m on m.campaign_id = c.campaign_id
  where c.id = character_id and m.user_id = auth.uid() and m.role = 'master'
));

create policy "members read resource events" on public.character_resource_events
for select using (exists (
  select 1 from public.characters c
  join public.campaign_members m on m.campaign_id = c.campaign_id
  where c.id = character_id and m.user_id = auth.uid()
));

create policy "members log resource events" on public.character_resource_events
for insert with check (exists (
  select 1 from public.characters c
  join public.campaign_members m on m.campaign_id = c.campaign_id
  where c.id = character_id and m.user_id = auth.uid()
));

grant execute on function public.toggle_campaign_clock(uuid) to authenticated;
