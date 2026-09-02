begin
  return substring(p_topic from 5)::uuid;
exception when others then
  return null;
end;
