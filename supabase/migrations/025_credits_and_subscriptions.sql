-- ─────────────────────────────────────────────────────────────
-- 025: Credit system + subscription tracking
-- ─────────────────────────────────────────────────────────────

-- ── user_credits: one row per user ─────────────────────────
create table if not exists user_credits (
  user_id                  uuid primary key references auth.users(id) on delete cascade,
  balance                  integer not null default 0,
  free_analyses_used       integer not null default 0,
  free_analyses_limit      integer not null default 2,   -- lifetime free analyses for MVP
  subscription_status      text    not null default 'free', -- 'free' | 'pro'
  subscription_expires_at  timestamptz,
  stripe_customer_id       text,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

-- ── credit_transactions: full audit log ────────────────────
create table if not exists credit_transactions (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users(id) on delete cascade,
  amount         integer     not null,          -- positive = add, negative = deduct
  balance_after  integer     not null,
  reason         text        not null,          -- 'rechnung_analyse' | 'kasse_analyse' | 'credit_purchase' | 'pro_subscription' | 'free_tier' | 'admin_grant'
  metadata       jsonb,
  created_at     timestamptz default now()
);

-- ── stripe_events: idempotency guard for webhooks ──────────
create table if not exists stripe_events (
  stripe_event_id  text primary key,
  processed_at     timestamptz default now()
);

-- ── Indexes ─────────────────────────────────────────────────
create index if not exists credit_transactions_user_id_idx on credit_transactions(user_id);
create index if not exists credit_transactions_created_at_idx on credit_transactions(created_at desc);

-- ── RLS ─────────────────────────────────────────────────────
alter table user_credits enable row level security;
alter table credit_transactions enable row level security;

create policy "user_credits_select_own" on user_credits
  for select using (auth.uid() = user_id);

create policy "credit_transactions_select_own" on credit_transactions
  for select using (auth.uid() = user_id);

-- ── Atomic credit increment (avoids read-then-write races) ──
create or replace function increment_user_credits(
  p_user_id  uuid,
  p_amount   integer,
  p_reason   text,
  p_metadata jsonb default null
)
returns integer   -- returns new balance
language plpgsql security definer
as $$
declare
  v_new_balance integer;
begin
  -- Ensure row exists (new users before first upload)
  insert into user_credits (user_id, balance, free_analyses_used, free_analyses_limit)
  values (p_user_id, 0, 0, 2)
  on conflict (user_id) do nothing;

  -- Atomic increment
  update user_credits
  set balance    = balance + p_amount,
      updated_at = now()
  where user_id  = p_user_id
  returning balance into v_new_balance;

  -- Audit log
  insert into credit_transactions (user_id, amount, balance_after, reason, metadata)
  values (p_user_id, p_amount, v_new_balance, p_reason, p_metadata);

  return v_new_balance;
end;
$$;

-- ── Auto-create credits row on user sign-up ─────────────────
create or replace function handle_new_user_credits()
returns trigger language plpgsql security definer
as $$
begin
  insert into public.user_credits (user_id, balance, free_analyses_used, free_analyses_limit)
  values (new.id, 0, 0, 2)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_credits on auth.users;
create trigger on_auth_user_created_credits
  after insert on auth.users
  for each row execute procedure handle_new_user_credits();

-- ── Backfill existing users ──────────────────────────────────
insert into user_credits (user_id, balance, free_analyses_used, free_analyses_limit)
select id, 0, 0, 2
from auth.users
on conflict (user_id) do nothing;
