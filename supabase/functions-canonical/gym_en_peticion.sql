select case
           when h ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then h::uuid
         end
  from (
    select lower(nullif(current_setting('request.headers', true)::json ->> 'x-gym-id', '')) as h
  ) s
