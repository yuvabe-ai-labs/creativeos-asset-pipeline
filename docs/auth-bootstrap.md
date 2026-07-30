# Auth bootstrap — first super_admin (one-time per environment)

The first Yuvabe operator can't be created by the admin UI (the UI needs a logged-in
super_admin to already exist). Do this once per environment, **after migrations 0012 + 0013**.
Every org after Yuvabe is created via `/admin/orgs/new` — never repeat this by hand.

## 1. Create the auth user (dashboard)

Supabase dashboard → Authentication → Add user → enter the operator's email + a password,
enable **Auto Confirm User**. Copy the new user's **UUID**.

## 2. Grant super_admin + link to the Yuvabe org (SQL editor)

Paste the new UUID in place of `<USER_UUID>`:

```sql
update auth.users
  set raw_app_meta_data = raw_app_meta_data || '{"platform_role":"super_admin"}'::jsonb
  where id = '<USER_UUID>';

insert into profiles (user_id, display_name)
  values ('<USER_UUID>', 'Yuvabe Operator');

insert into org_memberships (user_id, org_id, org_role)
  values ('<USER_UUID>', (select id from organizations where slug = 'yuvabe'), 'owner');
```

## 3. Verify

```sql
select u.email, u.raw_app_meta_data->>'platform_role' as platform_role,
       p.display_name, m.org_role
  from auth.users u
  join profiles p on p.user_id = u.id
  join org_memberships m on m.user_id = u.id
  where u.id = '<USER_UUID>';
-- expect: email | super_admin | Yuvabe Operator | owner
```

## Rollback (remove this bootstrap user)

```sql
delete from org_memberships where user_id = '<USER_UUID>';
delete from profiles where user_id = '<USER_UUID>';
-- then delete the user in the dashboard Authentication panel
```
