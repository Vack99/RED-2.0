declare
  v_gyms            int := 0;
  v_claims          int := 0;
  v_created         int := 0;
  v_errors          int := 0;
  v_pruned          int := 0;
  v_notes           text[] := '{}';
  v_summary         text;
  v_monday          date;
  v_claims_before   int;
  v_created_before  int;
  v_week            date;
  v_prune_cutoff    date;
  g                 record;
begin
  for g in
    select gy.id, gy.timezone
    from public.gym gy
    where exists (
      select 1 from public.schedule_template st where st.gym_id = gy.id and st.is_active
    )
    order by gy.id
  loop
    v_gyms := v_gyms + 1;
    
    
    
    v_claims_before := v_claims;
    v_created_before := v_created;
    begin
      
      
      v_monday := (now() at time zone g.timezone)::date;
      v_monday := v_monday - ((extract(isodow from v_monday)::int - 1));

      
      
      
      
      
      
      
      
      
      for o in 0..5 loop
        v_week := v_monday + (o * 7);
        if exists (
          select 1 from public.schedule_template st
          where st.gym_id = g.id and st.is_active
            and not exists (
              select 1 from public.schedule_template_week stw
              where stw.template_id = st.id and stw.week_start = v_week
            )
        ) then
          v_claims := v_claims + 1;
          v_created := v_created + public.materialize_week_for_gym(g.id, v_week);
        end if;
      end loop;
    exception when others then
      v_errors := v_errors + 1;
      v_notes := v_notes || (g.id::text || ': ' || sqlerrm);
      v_claims := v_claims_before;
      v_created := v_created_before;
    end;
  end loop;

  
  
  
  v_prune_cutoff := (now() at time zone 'UTC')::date;
  v_prune_cutoff := v_prune_cutoff - ((extract(isodow from v_prune_cutoff)::int - 1)) - 14;
  begin
    delete from public.schedule_template_week where week_start < v_prune_cutoff;
    get diagnostics v_pruned = row_count;
  exception when others then
    v_errors := v_errors + 1;
    v_notes := v_notes || ('prune: ' || sqlerrm);
  end;

  v_summary := format('gyms=%s claims=%s created=%s pruned=%s errors=%s%s',
    v_gyms, v_claims, v_created, v_pruned, v_errors,
    case when v_errors = 0 then '' else ' [' || array_to_string(v_notes, '; ') || ']' end);

  
  
  
  insert into public.cron_run_log (job, summary) values ('roll-class-horizon', v_summary);

  return v_summary;
end;
