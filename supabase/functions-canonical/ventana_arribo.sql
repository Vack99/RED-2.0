select tstzrange(
    p_starts_at - interval '90 minutes',
    p_starts_at + make_interval(mins => p_duration_min) + interval '15 minutes'
  );
