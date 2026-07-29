-- Run this in Supabase SQL Editor (supabase.com -> SQL Editor -> New query)

-- ── Profiles (username + display info) ───────────────────────────────────────
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique not null,
  display_name text,
  avatar_color text default '#00e5ff',
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Public profiles" on public.profiles for select using (true);
create policy "Own profile" on public.profiles for all using (auth.uid() = id);

-- ── Friend requests ───────────────────────────────────────────────────────────
create table if not exists public.friend_requests (
  id uuid default gen_random_uuid() primary key,
  from_id uuid references public.profiles(id) on delete cascade,
  to_id   uuid references public.profiles(id) on delete cascade,
  status  text default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz default now(),
  unique(from_id, to_id)
);
alter table public.friend_requests enable row level security;
create policy "See own requests" on public.friend_requests for select using (auth.uid() = from_id or auth.uid() = to_id);
create policy "Send request"     on public.friend_requests for insert with check (auth.uid() = from_id);
create policy "Update request"   on public.friend_requests for update using (auth.uid() = to_id);
create policy "Delete request"   on public.friend_requests for delete using (auth.uid() = from_id or auth.uid() = to_id);

-- ── Messages ──────────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  from_id  uuid references public.profiles(id) on delete cascade,
  to_id    uuid references public.profiles(id) on delete cascade,
  content  text not null,
  type     text default 'text' check (type in ('text','trade_share','battle_request','battle_result')),
  metadata jsonb,
  read     boolean default false,
  created_at timestamptz default now()
);
alter table public.messages enable row level security;
create policy "See own messages" on public.messages for select using (auth.uid() = from_id or auth.uid() = to_id);
create policy "Send message"     on public.messages for insert with check (auth.uid() = from_id);
create policy "Mark read"        on public.messages for update using (auth.uid() = to_id);

-- ── Battles ───────────────────────────────────────────────────────────────────
create table if not exists public.battles (
  id uuid default gen_random_uuid() primary key,
  challenger_id uuid references public.profiles(id) on delete cascade,
  opponent_id   uuid references public.profiles(id) on delete cascade,
  symbol        text default 'NQ',
  status        text default 'pending' check (status in ('pending','active','completed','declined')),
  challenger_trades jsonb,
  opponent_trades   jsonb,
  challenger_score  numeric,
  opponent_score    numeric,
  winner_id         uuid references public.profiles(id),
  created_at        timestamptz default now(),
  completed_at      timestamptz
);
alter table public.battles enable row level security;
create policy "See own battles" on public.battles for select using (auth.uid() = challenger_id or auth.uid() = opponent_id);
create policy "Create battle"   on public.battles for insert with check (auth.uid() = challenger_id);
create policy "Update battle"   on public.battles for update using (auth.uid() = challenger_id or auth.uid() = opponent_id);

-- Enable realtime for messages and battles
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.battles;
alter publication supabase_realtime add table public.friend_requests;

-- ── Sim Leaderboard (shared across all users) ─────────────────────────────────
create table if not exists public.sim_leaderboard (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  username text not null,
  account_name text not null,
  balance numeric not null default 10000,
  start_balance numeric not null default 10000,
  total_trades integer default 0,
  wins integer default 0,
  updated_at timestamptz default now(),
  unique(user_id, account_name)
);
alter table public.sim_leaderboard enable row level security;
create policy "Anyone can view leaderboard" on public.sim_leaderboard for select using (true);
create policy "Own entries" on public.sim_leaderboard for all using (auth.uid() = user_id);

-- ── Public user directory (for friend search) ─────────────────────────────────
-- Already handled by profiles table above, but make sure it's searchable
create index if not exists profiles_username_idx on public.profiles(username);

-- ── Profile bio + stats visibility (run this if upgrading from earlier schema) ──
alter table public.profiles add column if not exists bio text default '';
alter table public.profiles add column if not exists show_real_stats boolean default false;
alter table public.profiles add column if not exists twitter text default '';
alter table public.profiles add column if not exists joined_at timestamptz default now();

-- ── Blocks (documented here for completeness — already live, added out of band) ──
create table if not exists public.blocks (
  id uuid default gen_random_uuid() primary key,
  blocker_id uuid references public.profiles(id) on delete cascade,
  blocked_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique(blocker_id, blocked_id)
);
alter table public.blocks enable row level security;
create policy "See own blocks" on public.blocks for select using (auth.uid() = blocker_id or auth.uid() = blocked_id);
create policy "Create block"   on public.blocks for insert with check (auth.uid() = blocker_id);
create policy "Delete block"   on public.blocks for delete using (auth.uid() = blocker_id);

-- ── Reports (user safety — report a user for review) ──────────────────────────
create table if not exists public.reports (
  id uuid default gen_random_uuid() primary key,
  reporter_id uuid references public.profiles(id) on delete cascade,
  reported_id uuid references public.profiles(id) on delete cascade,
  reason text not null,
  created_at timestamptz default now()
);
alter table public.reports enable row level security;
create policy "Create report"   on public.reports for insert with check (auth.uid() = reporter_id);
create policy "See own reports" on public.reports for select using (auth.uid() = reporter_id);

-- ── Bans (moderation) ──────────────────────────────────────────────────────────
alter table public.profiles add column if not exists banned boolean default false;

-- To ban a user after reviewing a report:
--   update public.profiles set banned = true where username = 'someuser';
-- To unban:
--   update public.profiles set banned = false where username = 'someuser';

-- ── Terms of Service acceptance ────────────────────────────────────────────────
alter table public.profiles add column if not exists tos_accepted_at timestamptz;

-- ── Cloud trade sync, subscriptions, AI usage (documented here for the first
--    time — these tables already exist in production, added out of band, so
--    they were never in version control and their RLS couldn't be verified
--    from the codebase). Safe to run as-is: `create table if not exists` is a
--    no-op if the table's already there, and every policy is dropped and
--    recreated so this always converges on the correct definition regardless
--    of what's currently live.
--
--    cloud_trades.id is the trade's own id — globally unique, NOT scoped to
--    user_id — and /api/sync writes through the anon key + user session (not
--    the service role), so RLS is the only thing standing between a crafted
--    upsert reusing another user's row id and silently overwriting their
--    trade data. Verify this policy is actually in place. ────────────────────
create table if not exists public.cloud_trades (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  data jsonb not null,
  updated_at timestamptz default now()
);
alter table public.cloud_trades enable row level security;
drop policy if exists "See own cloud trades"   on public.cloud_trades;
drop policy if exists "Insert own cloud trades" on public.cloud_trades;
drop policy if exists "Update own cloud trades" on public.cloud_trades;
drop policy if exists "Delete own cloud trades" on public.cloud_trades;
create policy "See own cloud trades"    on public.cloud_trades for select using (auth.uid() = user_id);
create policy "Insert own cloud trades" on public.cloud_trades for insert with check (auth.uid() = user_id);
create policy "Update own cloud trades" on public.cloud_trades for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Delete own cloud trades" on public.cloud_trades for delete using (auth.uid() = user_id);

-- Subscriptions (Stripe billing state) — written only by the service role
-- (checkout/webhook routes), which bypasses RLS by design. The only policy
-- needed is read access for the owning user (requirePro() and
-- /api/subscription/status both read this via the anon key + session).
-- Deliberately no insert/update/delete policy: only the service role may
-- ever write this table.
create table if not exists public.subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text,
  plan text,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists "See own subscription" on public.subscriptions;
create policy "See own subscription" on public.subscriptions for select using (auth.uid() = user_id);

-- AI usage (daily request counter) — written only by the service role
-- (api-guard.ts). Read policy included for defense-in-depth in case a future
-- change reads it via the anon key.
create table if not exists public.ai_usage (
  user_id uuid references auth.users(id) on delete cascade not null,
  day date not null,
  count integer default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
drop policy if exists "See own ai usage" on public.ai_usage;
create policy "See own ai usage" on public.ai_usage for select using (auth.uid() = user_id);
