begin
  perform now() at time zone new.timezone;
  return new;
end;
