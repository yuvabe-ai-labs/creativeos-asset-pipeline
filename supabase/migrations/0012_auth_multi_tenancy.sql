-- Stage 1A auth & multi-tenancy schema. No RLS here (Stage 2). No clients change here (0013).

-- 1. Tenant boundary
create table organizations (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  slug                  text not null unique,
  monthly_credit_limit  numeric,            -- null = unlimited (Yuvabe's own org)
  created_at            timestamptz not null default now()
);

-- 2. App's extension of auth.users (display info only)
create table profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  created_at    timestamptz not null default now()
);

-- 3. Membership bridge — multi-seat-ready from day one; pilot creates only 'owner'.
create table org_memberships (
  user_id   uuid not null references auth.users(id) on delete cascade,
  org_id    uuid not null references organizations(id) on delete cascade,
  org_role  text not null check (org_role in ('owner', 'senior', 'designer')),
  joined_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

-- One active org per user in the pilot (D80). Multi-seat later drops this index.
create unique index org_memberships_one_org_per_user on org_memberships (user_id);
create index org_memberships_org_id_idx on org_memberships (org_id);

-- 4. Last-owner guard (D80): an org must always keep at least one owner.
create or replace function enforce_last_owner()
returns trigger language plpgsql as $$
declare
  target_org uuid;
  remaining_owners int;
begin
  target_org := coalesce(old.org_id, new.org_id);
  select count(*) into remaining_owners
    from org_memberships
    where org_id = target_org and org_role = 'owner'
      and user_id <> old.user_id;
  if tg_op = 'DELETE' and old.org_role = 'owner' and remaining_owners = 0 then
    raise exception 'Cannot remove the last owner of an organization';
  end if;
  if tg_op = 'UPDATE' and old.org_role = 'owner' and new.org_role <> 'owner'
     and remaining_owners = 0 then
    raise exception 'Cannot demote the last owner of an organization';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger org_memberships_last_owner
  before update or delete on org_memberships
  for each row execute function enforce_last_owner();

-- 5. Seed the Yuvabe org (unlimited credits)
insert into organizations (name, slug, monthly_credit_limit)
  values ('Yuvabe Studios', 'yuvabe', null);
