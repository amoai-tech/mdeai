alter table public.profiles enable row level security;

create policy "authenticated users can read profiles"
on public.profiles
for select
to authenticated
using (user_id is not null);
