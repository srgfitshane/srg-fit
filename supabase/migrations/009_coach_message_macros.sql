create table if not exists coach_message_macros (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists coach_message_macros_coach_id_idx
  on coach_message_macros (coach_id, created_at desc);
