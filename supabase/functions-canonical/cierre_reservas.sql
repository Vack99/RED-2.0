select case when g.corte_reservas then public.corte_reserva($1.starts_at, g.timezone) end
    from public.gym g
   where g.id = $1.gym_id;
