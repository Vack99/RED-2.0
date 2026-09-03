select case
           when extract(hour from (p_starts at time zone p_tz)) < 9
             
             
             
             then least(
                    p_starts - interval '3 hours',
                    ((((p_starts at time zone p_tz)::date - 1) + time '22:00') at time zone p_tz)
                  )
           else p_starts - interval '3 hours'
         end;
