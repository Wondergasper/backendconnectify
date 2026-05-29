-- ============================================================
-- B2B / Company Provider Migration
-- Adds: provider_profiles, provider_services, company_team_members,
--        service_requests, job_quotes
-- ============================================================

-- ------------------------------------------------------------
-- 1. provider_profiles
-- One row per provider user. Controls providerType and verification.
-- ------------------------------------------------------------
create table if not exists public.provider_profiles (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references public.app_users(id) on delete cascade,
  provider_type         text not null default 'individual' check (provider_type in ('individual', 'company')),
  display_name          text,
  business_name         text,                          -- company providers only
  contact_person_name   text,                          -- company providers only
  description           text check (description is null or length(description) <= 2000),
  phone                 text,
  email                 text,
  address               text,
  location              jsonb not null default '{}'::jsonb,
  operating_locations   jsonb not null default '[]'::jsonb,
  verification_status   text not null default 'pending' check (verification_status in ('pending', 'approved', 'rejected')),
  rejection_reason      text,
  rating                numeric(3,2) not null default 0 check (rating >= 0 and rating <= 5),
  is_active             boolean not null default true,
  created_at            timestamptz not null default timezone('utc', now()),
  updated_at            timestamptz not null default timezone('utc', now())
);

-- Auto-create individual profiles for existing provider users
insert into public.provider_profiles (user_id, provider_type, display_name)
  select id, 'individual', name
  from public.app_users
  where role = 'provider'
  on conflict (user_id) do nothing;

-- ------------------------------------------------------------
-- 2. provider_services
-- Service catalogue offered by a provider (independent of bookable services)
-- ------------------------------------------------------------
create table if not exists public.provider_services (
  id             uuid primary key default gen_random_uuid(),
  provider_id    uuid not null references public.provider_profiles(id) on delete cascade,
  service_name   text not null,
  category       text not null,
  description    text check (description is null or length(description) <= 1000),
  starting_price numeric(14,2) check (starting_price is null or starting_price >= 0),
  price_type     text not null default 'fixed' check (price_type in ('fixed', 'negotiable', 'quote')),
  is_available   boolean not null default true,
  created_at     timestamptz not null default timezone('utc', now()),
  updated_at     timestamptz not null default timezone('utc', now())
);

-- ------------------------------------------------------------
-- 3. company_team_members
-- Team members belonging to a company provider
-- ------------------------------------------------------------
create table if not exists public.company_team_members (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  full_name   text not null,
  role        text not null,
  phone       text not null,
  email       text,
  status      text not null default 'active' check (status in ('active', 'inactive')),
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now())
);

-- ------------------------------------------------------------
-- 4. service_requests
-- Customer-submitted B2B service requests (request-quote-accept flow)
-- ------------------------------------------------------------
create table if not exists public.service_requests (
  id                     uuid primary key default gen_random_uuid(),
  customer_id            uuid not null references public.app_users(id) on delete restrict,
  customer_type          text not null default 'individual' check (customer_type in ('individual', 'business')),
  service_category       text not null,
  description            text not null check (length(description) <= 2000),
  location               jsonb not null default '{}'::jsonb,
  budget                 numeric(14,2) check (budget is null or budget >= 0),
  urgency                text not null default 'normal' check (urgency in ('low', 'normal', 'high', 'urgent')),
  preferred_date         date,
  status                 text not null default 'pending'
                           check (status in ('pending', 'matched', 'quoted', 'accepted', 'assigned', 'in_progress', 'completed', 'cancelled')),
  assigned_provider_id   uuid references public.provider_profiles(id) on delete set null,
  assigned_team_member_id uuid references public.company_team_members(id) on delete set null,
  created_at             timestamptz not null default timezone('utc', now()),
  updated_at             timestamptz not null default timezone('utc', now())
);

-- ------------------------------------------------------------
-- 5. job_quotes
-- Quotes submitted by providers against service requests
-- ------------------------------------------------------------
create table if not exists public.job_quotes (
  id                      uuid primary key default gen_random_uuid(),
  request_id              uuid not null references public.service_requests(id) on delete cascade,
  provider_id             uuid not null references public.provider_profiles(id) on delete cascade,
  quoted_amount           numeric(14,2) not null check (quoted_amount >= 0),
  estimated_delivery_time text,
  message                 text check (message is null or length(message) <= 1000),
  status                  text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at              timestamptz not null default timezone('utc', now()),
  updated_at              timestamptz not null default timezone('utc', now()),
  unique (request_id, provider_id)   -- one quote per provider per request
);

-- ------------------------------------------------------------
-- Indexes
-- ------------------------------------------------------------
create index if not exists idx_provider_profiles_user_id        on public.provider_profiles(user_id);
create index if not exists idx_provider_profiles_type_status    on public.provider_profiles(provider_type, verification_status);
create index if not exists idx_provider_services_provider_id    on public.provider_services(provider_id);
create index if not exists idx_provider_services_category       on public.provider_services(category, is_available);
create index if not exists idx_company_team_members_provider    on public.company_team_members(provider_id);
create index if not exists idx_service_requests_customer        on public.service_requests(customer_id, created_at desc);
create index if not exists idx_service_requests_status          on public.service_requests(status);
create index if not exists idx_service_requests_provider        on public.service_requests(assigned_provider_id);
create index if not exists idx_job_quotes_request               on public.job_quotes(request_id);
create index if not exists idx_job_quotes_provider              on public.job_quotes(provider_id, created_at desc);

-- ------------------------------------------------------------
-- Updated-at triggers
-- ------------------------------------------------------------
drop trigger if exists set_provider_profiles_updated_at on public.provider_profiles;
create trigger set_provider_profiles_updated_at
  before update on public.provider_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_provider_services_updated_at on public.provider_services;
create trigger set_provider_services_updated_at
  before update on public.provider_services
  for each row execute function public.set_updated_at();

drop trigger if exists set_company_team_members_updated_at on public.company_team_members;
create trigger set_company_team_members_updated_at
  before update on public.company_team_members
  for each row execute function public.set_updated_at();

drop trigger if exists set_service_requests_updated_at on public.service_requests;
create trigger set_service_requests_updated_at
  before update on public.service_requests
  for each row execute function public.set_updated_at();

drop trigger if exists set_job_quotes_updated_at on public.job_quotes;
create trigger set_job_quotes_updated_at
  before update on public.job_quotes
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
alter table public.provider_profiles      enable row level security;
alter table public.provider_services      enable row level security;
alter table public.company_team_members   enable row level security;
alter table public.service_requests       enable row level security;
alter table public.job_quotes             enable row level security;

-- ------------------------------------------------------------
-- Service role grants (backend uses service_role key)
-- ------------------------------------------------------------
grant select, insert, update, delete on public.provider_profiles      to service_role;
grant select, insert, update, delete on public.provider_services      to service_role;
grant select, insert, update, delete on public.company_team_members   to service_role;
grant select, insert, update, delete on public.service_requests       to service_role;
grant select, insert, update, delete on public.job_quotes             to service_role;
