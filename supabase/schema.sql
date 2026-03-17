create table if not exists public.brands (
  id text primary key,
  name text not null,
  overview text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id text primary key,
  brand_id text not null references public.brands(id) on delete cascade,
  user_id text not null,
  module_id text not null,
  type text not null,
  instruction text not null,
  status text not null,
  structured_task jsonb not null default '{}'::jsonb,
  execution_package jsonb not null default '{}'::jsonb,
  refill jsonb,
  logs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz
);

create index if not exists tasks_user_brand_created_idx
  on public.tasks (user_id, brand_id, created_at desc);

create index if not exists tasks_status_idx
  on public.tasks (status);

create table if not exists public.leads (
  id text primary key,
  task_id text not null references public.tasks(id) on delete cascade,
  brand_id text not null references public.brands(id) on delete cascade,
  name text not null,
  platform text not null,
  followers text not null,
  fit_score integer not null default 0,
  contact text not null,
  status text not null,
  handling text not null,
  last_action text default '',
  next_action text default '',
  intent text default '',
  risk text default '',
  notes text default '',
  reminder_at timestamptz,
  reminder_note text default '',
  created_at timestamptz not null default now()
);

alter table public.leads
  add column if not exists reminder_at timestamptz;

alter table public.leads
  add column if not exists reminder_note text default '';

create index if not exists leads_task_created_idx
  on public.leads (task_id, created_at desc);

create index if not exists leads_status_idx
  on public.leads (status);

create table if not exists public.messages (
  id text primary key,
  lead_id text not null references public.leads(id) on delete cascade,
  task_id text not null references public.tasks(id) on delete cascade,
  role text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_lead_created_idx
  on public.messages (lead_id, created_at asc);
