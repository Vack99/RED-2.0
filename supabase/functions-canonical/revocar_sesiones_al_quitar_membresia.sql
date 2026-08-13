begin
  
  
  
  delete from auth.mfa_amr_claims
    where session_id in (select id from auth.sessions where user_id = old.user_id);
  delete from auth.refresh_tokens
    where session_id in (select id from auth.sessions where user_id = old.user_id);
  delete from auth.sessions where user_id = old.user_id;
  return null;  
end;
