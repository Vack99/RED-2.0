declare
  v_gyms uuid[];
  v_gym  uuid;
  v_guc  text;
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct gym_id) into v_gyms from n where gym_id is not null;
  elsif tg_op = 'UPDATE' then
    select array_agg(distinct z.gym_id) into v_gyms
      from (select gym_id from n union all select gym_id from o) z
     where z.gym_id is not null;
  else
    select array_agg(distinct gym_id) into v_gyms from o where gym_id is not null;
  end if;

  foreach v_gym in array coalesce(v_gyms, '{}'::uuid[]) loop
    v_guc := 'senal.g_' || replace(v_gym::text, '-', '');
    if coalesce(current_setting(v_guc, true), '') = '' then
      perform set_config(v_guc, '1', true);
      perform realtime.send(jsonb_build_object('t', tg_table_name), 'cambio', 'gym:' || v_gym::text, true);
    end if;
  end loop;

  return null;
end;
