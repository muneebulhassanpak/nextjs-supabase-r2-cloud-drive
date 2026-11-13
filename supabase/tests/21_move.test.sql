-- Moving items: rights on both ends, no cycles, no carrying files out of a shared tree.
begin;
\ir helpers/setup.psql
\ir helpers/fixture.psql
select plan(27);

-- Owner ------------------------------------------------------------------------------------------------

select tests.authenticate_as('owner');
select lives_ok(format('select public.move_item(%L, null)', tests.id('Sub')), 'owner moves a folder to their root');
select tests.clear_authentication();
select is((select ancestors from public.items where id = tests.id('Sub')), '{}'::uuid[], 'the folder''s path is updated');
select is((select ancestors from public.items where id = tests.id('f4')), array[tests.id('Sub'), tests.id('Deep')],
  'and so is the path of everything inside it');

select tests.authenticate_as('editor');
select is_empty(format('select 1 from public.items where id in (%L, %L)', tests.id('Sub'), tests.id('f4')),
  'moved out of the shared folder, it is out of the editor''s reach');
select tests.authenticate_as('viewer');
select is(tests.rows('select tests.label(id) from public.items where owner_id <> auth.uid()'),
  tests.sorted('{Sub,Deep,f2,f4}'), 'the viewer''s share was on the folder itself, so it moves with it');

select tests.authenticate_as('owner');
select lives_ok(format('select public.move_item(%L, %L)', tests.id('R'), tests.id('F')),
  'owner moves a private file into the shared folder');
select tests.authenticate_as('editor');
select isnt_empty(format('select 1 from public.items where id = %L', tests.id('R')), 'now the editor can see it');

select tests.authenticate_as('owner');
select throws_ok(format('select public.move_item(%L, %L)', tests.id('Sub'), tests.id('Sub')),
  'LK409', 'A folder can''t be moved inside itself', 'a folder cannot go inside itself');
select throws_ok(format('select public.move_item(%L, %L)', tests.id('Sub'), tests.id('Deep')),
  'LK409', 'A folder can''t be moved inside itself', 'or inside its own subfolder');
select throws_ok(format('select public.move_item(%L, %L)', tests.id('f2'), tests.id('f1')),
  'LK422', 'Items can only go inside a folder', 'a file cannot be a destination');
select throws_ok(format('select public.move_item(%L, %L)', tests.id('t1'), tests.id('Sub')),
  'LK409', 'Restore the item before moving it', 'trashed items stay put');
select throws_ok(format('select public.move_item(%L, %L)', tests.id('f2'), tests.id('EF')),
  'P0002', 'Item not found', 'owner cannot move into a folder they cannot see');

select tests.clear_authentication();
select tests.new_file('clash', 'owner', 'Deep', 'Plan.PDF');
select tests.authenticate_as('owner');
select throws_ok(format('select public.move_item(%L, %L)', tests.id('clash'), tests.id('F')),
  '23505', null, 'a name clash at the destination is refused');

-- Editor -----------------------------------------------------------------------------------------------

select tests.clear_authentication();
select public.move_item(tests.id('Sub'), tests.id('F')) from (select tests.authenticate_as('owner')) a;
select tests.authenticate_as('editor');
select lives_ok(format('select public.move_item(%L, %L)', tests.id('f1'), tests.id('Sub')),
  'editor moves a file around inside the shared folder');
select throws_ok(format('select public.move_item(%L, null)', tests.id('f1')),
  '42501', null, 'editor cannot move the owner''s file to a root');
select throws_ok(format('select public.move_item(%L, %L)', tests.id('f1'), tests.id('EF')),
  '42501', null, 'editor cannot carry the owner''s file into their own drive');
select throws_ok(format('select public.move_item(%L, %L)', tests.id('F'), tests.id('EF')),
  '42501', null, 'editor cannot move the shared folder itself');
select lives_ok(format('select public.move_item(%L, %L)', tests.id('e1'), tests.id('EF')),
  'editor moves their own upload back to their drive');
select lives_ok(format('select public.move_item(%L, %L)', tests.id('EF'), tests.id('Sub')),
  'editor moves their own folder into the shared folder');
select tests.authenticate_as('viewer');
select isnt_empty(format('select 1 from public.items where id = %L', tests.id('e1')),
  'what moved in is now visible to people with access there');

-- The two-step attack: an editor puts the owner's file inside a folder of their own, then tries to
-- take that folder home.
select tests.authenticate_as('editor');
select lives_ok(format('select public.move_item(%L, %L)', tests.id('f1'), tests.id('EF')),
  'editor moves the owner''s file into their own folder inside the shared tree (still the same tree)');
select throws_ok(format('select public.move_item(%L, null)', tests.id('EF')),
  '42501', 'Items owned by other people can only be moved within the folder they''re in',
  'but cannot take that folder out of the tree while it holds someone else''s file');
select tests.authenticate_as('owner');
select throws_ok(format('select public.move_item(%L, null)', tests.id('Sub')),
  '42501', 'Items owned by other people can only be moved within the folder they''re in',
  'the rule holds for the owner too: other people''s files are not carried into another tree');
select tests.clear_authentication();
select ok((select ancestors[1] = tests.id('F') from public.items where id = tests.id('f1')),
  'the owner''s file is still inside the shared folder');

-- Viewer and stranger -----------------------------------------------------------------------------------

select tests.authenticate_as('viewer');
select throws_ok(format('select public.move_item(%L, %L)', tests.id('f2'), tests.id('Deep')),
  '42501', null, 'viewer cannot move anything');
select tests.authenticate_as('stranger');
select throws_ok(format('select public.move_item(%L, %L)', tests.id('f1'), tests.id('SR')),
  'P0002', 'Item not found', 'stranger cannot even tell the file exists');

select tests.clear_authentication();
select ok(
  not exists (
    select 1 from public.items c join public.items p on p.id = c.parent_id
    where c.ancestors <> p.ancestors || p.id
  ),
  'after all the moves, every path still matches its parent'
);

select * from finish();
rollback;
