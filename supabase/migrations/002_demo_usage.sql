-- Daily model-call counter for the public demo.
-- No policies: the service role bypasses RLS, and other roles cannot write the counter.
-- consume_demo_call increments today's count only while it is still under max_calls.

create table if not exists demo_usage (
  day date primary key,
  model_calls integer not null default 0,
  constraint demo_usage_calls_nonnegative check (model_calls >= 0)
);

alter table demo_usage enable row level security;

create or replace function consume_demo_call(max_calls integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated integer;
begin
  if max_calls is null or max_calls < 1 then
    return false;
  end if;

  insert into demo_usage as usage (day, model_calls)
  values (current_date, 1)
  on conflict (day) do update
    set model_calls = usage.model_calls + 1
    where usage.model_calls < max_calls
  returning model_calls into updated;

  return updated is not null;
end;
$$;

revoke all on function public.consume_demo_call(integer) from public;
revoke all on function public.consume_demo_call(integer) from anon;
revoke all on function public.consume_demo_call(integer) from authenticated;
grant execute on function public.consume_demo_call(integer) to service_role;
