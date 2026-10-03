-- Holioo: end-to-end permission check for People + Holioo Shares, run against the REAL database.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/verify/people_shares_check.sql
-- (use the "Session pooler" / direct connection string of the Supabase project; it is never stored by this script)
--
-- SAFE BY CONSTRUCTION: everything runs inside ONE transaction that ends with ROLLBACK. The four test users, their
-- profiles, connections, shares and storage rows exist only inside it and vanish at the end (no files are uploaded:
-- only rows are checked). Real users are never read for their data or modified: only the random test ids are used.
-- Needs migrations 20261004120000 and 20261004130000 applied. Prints PASS / FAIL per check and a final summary.
begin;
create temp table results(n serial, name text, ok boolean, detail text) on commit drop;
grant all on results to public; grant usage on sequence results_n_seq to public;

do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  ida text := 'htesta' || substr(replace(a::text,'-',''),1,8); idb text := 'htestb' || substr(replace(b::text,'-',''),1,8);
  cnt int; txt text;
  paths_a text[] := array[]::text[];
begin
  -- ---- temporary users (rolled back) ----
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  select u, 'authenticated', 'authenticated', 'people-check-' || substr(u::text,1,8) || '@invalid.test', now(), now() from unnest(array[a,b,c,d]) u;
  insert into public.profiles (id, user_id, holioo_id, email, name, display_name)
  values (a, a, ida, 'people-check-a@invalid.test', 'Test A', 'Test A'), (b, b, idb, 'people-check-b@invalid.test', 'Test B', 'Test B'),
         (c, c, 'htestc' || substr(replace(c::text,'-',''),1,8), 'people-check-c@invalid.test', 'Test C', 'Test C'),
         (d, d, 'htestd' || substr(replace(d::text,'-',''),1,8), 'people-check-d@invalid.test', 'Test D', 'Test D');
  paths_a := array[a::text || '/k1/01-a.pdf'];

  -- helper: run a statement as user u (authenticated) and report whether it raised
  create or replace function pg_temp.as_user(u uuid, stmt text) returns text language plpgsql as $f$
  declare r text;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin execute stmt into r; exception when others then r := 'ERR:' || sqlerrm; end;
    reset role;
    return r;
  end $f$;
  create or replace function pg_temp.ck(nm text, ok boolean, det text default '') returns void language sql as
    $f$ insert into pg_temp.results(name, ok, detail) values (nm, ok, det) $f$;

  -- 1 exact search (with @ and capitals), 2 no prefix search, 3 no stranger listing
  txt := pg_temp.as_user(a, format('select display_name from find_holioo_person(%L)', '@' || upper(idb)));
  perform pg_temp.ck('exact-ID search finds the person (name only)', txt = 'Test B', coalesce(txt,'null'));
  txt := pg_temp.as_user(a, format('select count(*)::text from find_holioo_person(%L)', substr(idb, 1, 8)));
  perform pg_temp.ck('prefix search returns nothing', txt = '0', coalesce(txt,'null'));
  txt := pg_temp.as_user(a, format('select count(*)::text from public_profiles where uid <> %L', a));
  perform pg_temp.ck('cannot list other people''s public profiles', txt = '0', coalesce(txt,'null'));
  txt := pg_temp.as_user(a, format('select count(*)::text from profiles where id <> %L', a));
  perform pg_temp.ck('private profiles table shows only my own row', txt = '0', coalesce(txt,'null'));

  -- 4 add, 5-6 refusals, 7 privacy of my list, 8 now I can see them
  txt := pg_temp.as_user(a, format('insert into connections(person_id) values (%L) returning ''ok''', b));
  perform pg_temp.ck('add a person (instant, one-way)', txt = 'ok', coalesce(txt,'null'));
  txt := pg_temp.as_user(a, format('insert into connections(person_id) values (%L) returning ''ok''', gen_random_uuid()));
  perform pg_temp.ck('cannot add a person who does not exist', txt like 'ERR:%', coalesce(txt,'null'));
  txt := pg_temp.as_user(a, format('insert into connections(person_id) values (%L) returning ''ok''', a));
  perform pg_temp.ck('cannot add myself', txt like 'ERR:%', coalesce(txt,'null'));
  txt := pg_temp.as_user(b, 'select count(*)::text from connections');
  perform pg_temp.ck('the other person does not see my connections (one-way, private)', txt = '0', coalesce(txt,'null'));
  txt := pg_temp.as_user(a, format('select count(*)::text from public_profiles where uid = %L', b));
  perform pg_temp.ck('I can read the profile of someone I added', txt = '1', coalesce(txt,'null'));

  -- storage + share creation rules
  txt := pg_temp.as_user(a, format('insert into storage.objects(bucket_id,name) values (''shared-items'', %L) returning ''ok''', paths_a[1]));
  perform pg_temp.ck('upload into my own folder', txt = 'ok', coalesce(txt,'null'));
  txt := pg_temp.as_user(a, format('insert into storage.objects(bucket_id,name) values (''shared-items'', %L) returning ''ok''', b::text || '/k1/x.pdf'));
  perform pg_temp.ck('cannot upload into someone else''s folder', txt like 'ERR:%', coalesce(txt,'null'));
  txt := pg_temp.as_user(a, format('insert into shares(recipient_id,kind,title,paths) values (%L,''pdf'',''t'',%L) returning ''ok''', c, paths_a));
  perform pg_temp.ck('cannot share with someone I did not add', txt like 'ERR:%', coalesce(txt,'null'));
  txt := pg_temp.as_user(a, format('insert into shares(recipient_id,kind,title,paths) values (%L,''pdf'',''t'',%L) returning ''ok''', b, array[c::text || '/k/x.pdf']));
  perform pg_temp.ck('cannot share a file outside my folder', txt like 'ERR:%', coalesce(txt,'null'));

  -- before the share: recipient and third user see nothing
  txt := pg_temp.as_user(b, 'select ((select count(*) from storage.objects where bucket_id=''shared-items'') + (select count(*) from shares))::text');
  perform pg_temp.ck('recipient sees nothing before the share', txt = '0', coalesce(txt,'null'));

  -- 9 share, recipient sees file + share + sender profile; third user sees nothing
  txt := pg_temp.as_user(a, format('insert into shares(recipient_id,kind,title,course,section,paths) values (%L,''pdf'',''TD 3'',''Chimie'',''TD'',%L) returning ''ok''', b, paths_a));
  perform pg_temp.ck('share with a person I added', txt = 'ok', coalesce(txt,'null'));
  txt := pg_temp.as_user(b, format('select ((select count(*) from storage.objects where bucket_id=''shared-items'' and name=%L) || ''/'' || (select count(*) from shares) || ''/'' || (select count(*) from public_profiles where uid=%L))', paths_a[1], a));
  perform pg_temp.ck('recipient sees the file, the share and the sender''s name', txt = '1/1/1', coalesce(txt,'null'));
  txt := pg_temp.as_user(c, 'select ((select count(*) from storage.objects where bucket_id=''shared-items'') || ''/'' || (select count(*) from shares) || ''/'' || (select count(*) from public_profiles))');
  perform pg_temp.ck('a third user sees nothing (no file, no share, no profiles)', txt = '0/0/1', 'third user only sees own profile: ' || coalesce(txt,'null'));

  -- view-only: recipient cannot re-share, edit, delete the file
  txt := pg_temp.as_user(b, format('insert into connections(person_id) values (%L) returning ''ok''', c));
  txt := pg_temp.as_user(b, format('insert into shares(recipient_id,kind,title,paths) values (%L,''pdf'',''re'',%L) returning ''ok''', c, paths_a));
  perform pg_temp.ck('recipient cannot re-share the file', txt like 'ERR:%', coalesce(txt,'null'));
  txt := pg_temp.as_user(b, 'update shares set title=''x'' returning ''ok''');
  perform pg_temp.ck('recipient cannot edit a share', txt like 'ERR:%' or txt is null, coalesce(txt,'null'));
  txt := pg_temp.as_user(b, 'delete from storage.objects where bucket_id=''shared-items'' returning ''ok''');
  perform pg_temp.ck('recipient cannot delete the owner''s file', txt is null, coalesce(txt,'null'));

  -- 10 block: B blocks A -> A is "not found", cannot share with B, B no longer sees A's share; unblock restores
  txt := pg_temp.as_user(b, format('insert into blocks(blocked_id) values (%L) returning ''ok''', a));
  perform pg_temp.ck('block a person', txt = 'ok', coalesce(txt,'null'));
  txt := pg_temp.as_user(a, format('select count(*)::text from find_holioo_person(%L)', idb));
  perform pg_temp.ck('a blocked person can no longer find me', txt = '0', coalesce(txt,'null'));
  txt := pg_temp.as_user(a, format('insert into shares(recipient_id,kind,title,paths) values (%L,''pdf'',''t2'',%L) returning ''ok''', b, paths_a));
  perform pg_temp.ck('a blocked person cannot share with me', txt like 'ERR:%', coalesce(txt,'null'));
  txt := pg_temp.as_user(b, 'select ((select count(*) from shares) || ''/'' || (select count(*) from storage.objects where bucket_id=''shared-items''))');
  perform pg_temp.ck('blocking hides what that person shared (rows and files)', txt = '0/0', coalesce(txt,'null'));
  txt := pg_temp.as_user(a, 'select count(*)::text from blocks');
  perform pg_temp.ck('the blocked person cannot see the block', txt = '0', coalesce(txt,'null'));
  txt := pg_temp.as_user(b, format('delete from blocks where blocked_id = %L returning ''ok''', a));
  txt := pg_temp.as_user(b, 'select count(*)::text from shares');
  perform pg_temp.ck('unblocking restores access', txt = '1', coalesce(txt,'null'));

  -- 11 revoke
  txt := pg_temp.as_user(a, 'delete from shares returning ''ok''');
  perform pg_temp.ck('owner revokes a share', txt = 'ok', coalesce(txt,'null'));
  txt := pg_temp.as_user(b, 'select ((select count(*) from shares) + (select count(*) from storage.objects where bucket_id=''shared-items''))::text');
  perform pg_temp.ck('after revoke the recipient loses the file and the share', txt = '0', coalesce(txt,'null'));

  -- 12 holioo_id immutable for app users
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin update public.profiles set holioo_id = 'hevil0000000' where id = a; exception when others then null; end;
  reset role;
  select holioo_id into txt from public.profiles where id = a;
  perform pg_temp.ck('a user cannot change their own holioo_id', txt = ida, coalesce(txt,'null'));

  -- 13 anonymous access
  execute 'set local role anon';
  begin perform * from public.find_holioo_person(idb); txt := 'allowed'; exception when others then txt := 'denied'; end;
  perform pg_temp.ck('anon cannot call the search', txt = 'denied', txt);
  begin perform 1 from public.public_profiles limit 1; txt := 'allowed'; exception when others then txt := 'denied'; end;
  perform pg_temp.ck('anon cannot read public profiles', txt = 'denied', txt);
  begin perform 1 from public.shares limit 1; txt := 'allowed'; exception when others then txt := 'denied'; end;
  perform pg_temp.ck('anon cannot read shares', txt = 'denied', txt);
  reset role;

  -- 14 rate limit: 15 lookups / minute / user (fresh user D)
  cnt := 0;
  for i in 1..15 loop
    txt := pg_temp.as_user(d, format('select count(*)::text from find_holioo_person(%L)', 'hnobody' || i));
    if txt like 'ERR:%' then cnt := cnt + 1; end if;
  end loop;
  perform pg_temp.ck('15 lookups in a minute are allowed', cnt = 0, 'errors=' || cnt);
  txt := pg_temp.as_user(d, 'select count(*)::text from find_holioo_person(''hnobody99'')');
  perform pg_temp.ck('the 16th lookup is rate-limited', txt like 'ERR:%rate_limited%', coalesce(txt,'null'));
end $$;

select case when ok then 'PASS' else 'FAIL' end as result, name, case when ok then '' else detail end as detail from results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from results;
rollback;   -- nothing above is kept
