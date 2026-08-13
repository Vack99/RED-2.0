select g.brand_name, g.slug, c.nombre
    from public.clientes c
    join public.gym g on g.id = c.gym_id
   where c.claim_code = p_codigo;
