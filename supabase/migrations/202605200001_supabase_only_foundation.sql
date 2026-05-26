create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  name text not null,
  email text not null unique,
  phone text not null unique,
  password_hash text,
  role text not null default 'customer' check (role in ('customer', 'provider', 'admin')),
  profile jsonb not null default '{}'::jsonb,
  provider_details jsonb not null default '{}'::jsonb,
  rating_average numeric(3,2) not null default 0 check (rating_average >= 0 and rating_average <= 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  completed_jobs_count integer not null default 0 check (completed_jobs_count >= 0),
  wallet_balance numeric(14,2) not null default 0 check (wallet_balance >= 0),
  wallet_currency text not null default 'NGN',
  is_active boolean not null default true,
  refresh_token_hash text,
  reset_password_token text,
  reset_password_expire timestamptz,
  fcm_token text,
  source text not null default 'web',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  icon text,
  image text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.app_users(id) on delete cascade,
  name text not null,
  category text not null,
  description text not null check (length(description) <= 1000),
  price numeric(14,2) not null check (price >= 0),
  price_type text not null default 'hourly' check (price_type in ('fixed', 'hourly', 'negotiable')),
  duration_minutes integer not null check (duration_minutes > 0),
  images text[] not null default '{}',
  location jsonb not null default '{}'::jsonb,
  rating_average numeric(3,2) not null default 0 check (rating_average >= 0 and rating_average <= 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  services_offered text[] not null default '{}',
  gallery text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.app_users(id) on delete cascade,
  date date not null,
  slots jsonb not null default '[]'::jsonb,
  is_available boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (provider_id, date)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.app_users(id) on delete restrict,
  provider_id uuid not null references public.app_users(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  date date not null,
  start_time text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rejected', 'rescheduled')),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  currency text not null default 'NGN',
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'refunded')),
  notes text,
  address jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  rating jsonb,
  service_images text[] not null default '{}',
  reminder_sent boolean not null default false,
  source text not null default 'app',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  type text not null check (type in ('credit', 'debit')),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'NGN',
  description text not null,
  reference text not null unique,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payment_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  brand text not null check (length(brand) <= 40),
  last4 text not null check (last4 ~ '^[0-9]{4}$'),
  expiry_month text not null check (expiry_month ~ '^(0[1-9]|1[0-2])$'),
  expiry_year text not null check (expiry_year ~ '^[0-9]{2,4}$'),
  card_holder_name text check (card_holder_name is null or length(card_holder_name) <= 100),
  authorization_code text,
  provider text not null default 'paystack',
  is_default boolean not null default false,
  status text not null default 'active' check (status in ('active', 'expired', 'disabled')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  name text,
  is_archived boolean not null default false,
  is_pinned boolean not null default false,
  type text not null default 'direct' check (type in ('direct', 'group')),
  members_count integer not null default 2 check (members_count >= 1),
  last_message jsonb,
  last_message_at timestamptz not null default timezone('utc', now()),
  is_group boolean not null default false,
  group_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  last_read_message_id uuid,
  last_read_at timestamptz not null default timezone('utc', now()),
  unread_count integer not null default 0 check (unread_count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.app_users(id) on delete cascade,
  recipient_id uuid not null references public.app_users(id) on delete cascade,
  content text not null check (length(content) <= 1000),
  content_type text not null default 'text' check (content_type in ('text', 'image', 'document', 'location')),
  attachments jsonb not null default '[]'::jsonb,
  read boolean not null default false,
  read_by jsonb not null default '[]'::jsonb,
  delivered boolean not null default false,
  delivered_at timestamptz,
  status text not null default 'sent' check (status in ('sent', 'delivered', 'read')),
  replied_to_id uuid references public.messages(id) on delete set null,
  reactions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.app_users(id) on delete cascade,
  provider_id uuid not null references public.app_users(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text check (comment is null or length(comment) <= 500),
  images text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (booking_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  title text not null,
  body text not null,
  type text not null default 'general',
  data jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.app_users(id) on delete cascade,
  document_type text not null check (document_type in ('ID', 'PASSPORT', 'LICENSE', 'CERTIFICATE', 'BUSINESS_LICENSE', 'OTHER')),
  document_number text not null,
  document_front text not null,
  document_back text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  verified_by uuid references public.app_users(id) on delete set null,
  verification_date timestamptz,
  rejection_reason text,
  additional_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.app_users(id) on delete set null,
  actor_name text not null default 'System',
  actor_role text not null default 'system',
  action text not null,
  entity_type text not null,
  entity_id text,
  target text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_app_users_role on public.app_users(role);
create index if not exists idx_services_provider_created on public.services(provider_id, created_at desc);
create index if not exists idx_services_category_active on public.services(category, is_active);
create index if not exists idx_services_search on public.services using gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(category, '') || ' ' || coalesce(description, '')));
create index if not exists idx_availability_provider_date on public.availability(provider_id, date);
create index if not exists idx_bookings_customer_created on public.bookings(customer_id, created_at desc);
create index if not exists idx_bookings_provider_created on public.bookings(provider_id, created_at desc);
create index if not exists idx_bookings_status on public.bookings(status);
create index if not exists idx_bookings_reminders on public.bookings(reminder_sent, date, status);
create index if not exists idx_wallet_transactions_user_created on public.wallet_transactions(user_id, created_at desc);
create index if not exists idx_payment_cards_user_default on public.payment_cards(user_id, is_default);
create index if not exists idx_conversation_participants_user on public.conversation_participants(user_id);
create index if not exists idx_conversations_last_message_at on public.conversations(last_message_at desc);
create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at desc);
create index if not exists idx_messages_sender_created on public.messages(sender_id, created_at desc);
create index if not exists idx_reviews_provider_created on public.reviews(provider_id, created_at desc);
create index if not exists idx_reviews_service_created on public.reviews(service_id, created_at desc);
create index if not exists idx_notifications_user_created on public.notifications(user_id, created_at desc);
create index if not exists idx_audit_logs_created on public.audit_logs(created_at desc);

drop trigger if exists set_app_users_updated_at on public.app_users;
create trigger set_app_users_updated_at before update on public.app_users for each row execute function public.set_updated_at();
drop trigger if exists set_categories_updated_at on public.categories;
create trigger set_categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
drop trigger if exists set_services_updated_at on public.services;
create trigger set_services_updated_at before update on public.services for each row execute function public.set_updated_at();
drop trigger if exists set_availability_updated_at on public.availability;
create trigger set_availability_updated_at before update on public.availability for each row execute function public.set_updated_at();
drop trigger if exists set_bookings_updated_at on public.bookings;
create trigger set_bookings_updated_at before update on public.bookings for each row execute function public.set_updated_at();
drop trigger if exists set_wallet_transactions_updated_at on public.wallet_transactions;
create trigger set_wallet_transactions_updated_at before update on public.wallet_transactions for each row execute function public.set_updated_at();
drop trigger if exists set_payment_cards_updated_at on public.payment_cards;
create trigger set_payment_cards_updated_at before update on public.payment_cards for each row execute function public.set_updated_at();
drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at before update on public.conversations for each row execute function public.set_updated_at();
drop trigger if exists set_messages_updated_at on public.messages;
create trigger set_messages_updated_at before update on public.messages for each row execute function public.set_updated_at();
drop trigger if exists set_reviews_updated_at on public.reviews;
create trigger set_reviews_updated_at before update on public.reviews for each row execute function public.set_updated_at();
drop trigger if exists set_notifications_updated_at on public.notifications;
create trigger set_notifications_updated_at before update on public.notifications for each row execute function public.set_updated_at();
drop trigger if exists set_verification_requests_updated_at on public.verification_requests;
create trigger set_verification_requests_updated_at before update on public.verification_requests for each row execute function public.set_updated_at();

alter table public.app_users enable row level security;
alter table public.categories enable row level security;
alter table public.services enable row level security;
alter table public.availability enable row level security;
alter table public.bookings enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.payment_cards enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.verification_requests enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.credit_wallet_from_pending_transaction(
  p_user_id uuid,
  p_reference text,
  p_amount numeric
) returns jsonb
language plpgsql
as $$
declare
  v_tx public.wallet_transactions%rowtype;
  v_balance numeric(14,2);
  v_currency text;
begin
  select *
    into v_tx
    from public.wallet_transactions
   where reference = p_reference
     and user_id = p_user_id
   for update;

  if not found then
    raise exception 'Transaction not found';
  end if;

  if v_tx.status = 'completed' then
    select wallet_balance, wallet_currency
      into v_balance, v_currency
      from public.app_users
     where id = p_user_id;

    return jsonb_build_object(
      'balance', v_balance,
      'currency', coalesce(v_currency, 'NGN'),
      'amountAdded', v_tx.amount,
      'alreadyCompleted', true,
      'transactionId', v_tx.id
    );
  end if;

  if v_tx.status <> 'pending' then
    raise exception 'Transaction is no longer eligible for verification';
  end if;

  if v_tx.type <> 'credit' then
    raise exception 'Transaction is not a credit';
  end if;

  if v_tx.amount <> p_amount then
    raise exception 'Transaction amount mismatch';
  end if;

  update public.app_users
     set wallet_balance = wallet_balance + p_amount
   where id = p_user_id
  returning wallet_balance, wallet_currency into v_balance, v_currency;

  if not found then
    raise exception 'User not found';
  end if;

  update public.wallet_transactions
     set status = 'completed'
   where id = v_tx.id;

  return jsonb_build_object(
    'balance', v_balance,
    'currency', coalesce(v_currency, 'NGN'),
    'amountAdded', p_amount,
    'alreadyCompleted', false,
    'transactionId', v_tx.id
  );
end;
$$;

create or replace function public.create_manual_wallet_credit(
  p_user_id uuid,
  p_amount numeric,
  p_currency text,
  p_reference text,
  p_description text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_balance numeric(14,2);
  v_currency text;
  v_tx_id uuid;
begin
  if p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  update public.app_users
     set wallet_balance = wallet_balance + p_amount
   where id = p_user_id
  returning wallet_balance, wallet_currency into v_balance, v_currency;

  if not found then
    raise exception 'User not found';
  end if;

  insert into public.wallet_transactions (
    user_id, type, amount, currency, description, reference, status, metadata
  ) values (
    p_user_id, 'credit', p_amount, coalesce(p_currency, 'NGN'), p_description, p_reference, 'completed', coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_tx_id;

  return jsonb_build_object(
    'balance', v_balance,
    'currency', coalesce(v_currency, 'NGN'),
    'amountAdded', p_amount,
    'transactionId', v_tx_id
  );
end;
$$;

create or replace function public.create_wallet_withdrawal_debit(
  p_user_id uuid,
  p_amount numeric,
  p_currency text,
  p_reference text,
  p_description text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_current_balance numeric(14,2);
  v_balance numeric(14,2);
  v_currency text;
  v_tx_id uuid;
begin
  if p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  select wallet_balance, wallet_currency
    into v_current_balance, v_currency
    from public.app_users
   where id = p_user_id
   for update;

  if not found then
    raise exception 'User not found';
  end if;

  if v_current_balance < p_amount then
    raise exception 'Insufficient balance';
  end if;

  update public.app_users
     set wallet_balance = wallet_balance - p_amount
   where id = p_user_id
  returning wallet_balance, wallet_currency into v_balance, v_currency;

  insert into public.wallet_transactions (
    user_id, type, amount, currency, description, reference, status, metadata
  ) values (
    p_user_id, 'debit', p_amount, coalesce(p_currency, 'NGN'), p_description, p_reference, 'pending', coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_tx_id;

  return jsonb_build_object(
    'balance', v_balance,
    'currency', coalesce(v_currency, 'NGN'),
    'amountDebited', p_amount,
    'transactionId', v_tx_id
  );
end;
$$;

create or replace function public.refund_wallet_withdrawal(
  p_user_id uuid,
  p_reference text
) returns jsonb
language plpgsql
as $$
declare
  v_tx public.wallet_transactions%rowtype;
  v_balance numeric(14,2);
  v_currency text;
begin
  select *
    into v_tx
    from public.wallet_transactions
   where reference = p_reference
     and user_id = p_user_id
     and type = 'debit'
   for update;

  if not found then
    raise exception 'Withdrawal transaction not found';
  end if;

  if v_tx.status = 'refunded' then
    select wallet_balance, wallet_currency
      into v_balance, v_currency
      from public.app_users
     where id = p_user_id;

    return jsonb_build_object(
      'balance', v_balance,
      'currency', coalesce(v_currency, 'NGN'),
      'amountRefunded', v_tx.amount,
      'alreadyRefunded', true,
      'transactionId', v_tx.id
    );
  end if;

  if v_tx.status <> 'pending' then
    raise exception 'Withdrawal is not refundable';
  end if;

  update public.app_users
     set wallet_balance = wallet_balance + v_tx.amount
   where id = p_user_id
  returning wallet_balance, wallet_currency into v_balance, v_currency;

  update public.wallet_transactions
     set status = 'refunded'
   where id = v_tx.id;

  return jsonb_build_object(
    'balance', v_balance,
    'currency', coalesce(v_currency, 'NGN'),
    'amountRefunded', v_tx.amount,
    'alreadyRefunded', false,
    'transactionId', v_tx.id
  );
end;
$$;

create or replace function public.process_booking_wallet_payment(
  p_booking_id uuid,
  p_customer_id uuid,
  p_customer_reference text,
  p_provider_reference text
) returns jsonb
language plpgsql
as $$
declare
  v_booking public.bookings%rowtype;
  v_service public.services%rowtype;
  v_customer_balance numeric(14,2);
  v_provider_balance numeric(14,2);
  v_customer_tx_id uuid;
  v_provider_tx_id uuid;
begin
  select *
    into v_booking
    from public.bookings
   where id = p_booking_id
     and customer_id = p_customer_id
   for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.payment_status <> 'pending' then
    raise exception 'Payment already processed';
  end if;

  select *
    into v_service
    from public.services
   where id = v_booking.service_id;

  select wallet_balance
    into v_customer_balance
    from public.app_users
   where id = p_customer_id
   for update;

  if not found then
    raise exception 'Customer not found';
  end if;

  if v_customer_balance < v_booking.total_amount then
    raise exception 'Insufficient balance';
  end if;

  perform 1
    from public.app_users
   where id = v_booking.provider_id
   for update;

  if not found then
    raise exception 'Provider not found';
  end if;

  update public.app_users
     set wallet_balance = wallet_balance - v_booking.total_amount
   where id = p_customer_id
  returning wallet_balance into v_customer_balance;

  insert into public.wallet_transactions (
    user_id, type, amount, currency, description, reference, status, metadata
  ) values (
    p_customer_id,
    'debit',
    v_booking.total_amount,
    v_booking.currency,
    'Payment for ' || coalesce(v_service.name, 'service') || ' (Booking #' || v_booking.id || ')',
    p_customer_reference,
    'completed',
    jsonb_build_object('bookingId', v_booking.id, 'providerId', v_booking.provider_id)
  )
  returning id into v_customer_tx_id;

  update public.app_users
     set wallet_balance = wallet_balance + v_booking.total_amount
   where id = v_booking.provider_id
  returning wallet_balance into v_provider_balance;

  insert into public.wallet_transactions (
    user_id, type, amount, currency, description, reference, status, metadata
  ) values (
    v_booking.provider_id,
    'credit',
    v_booking.total_amount,
    v_booking.currency,
    'Payment received for ' || coalesce(v_service.name, 'service') || ' (Booking #' || v_booking.id || ')',
    p_provider_reference,
    'completed',
    jsonb_build_object('bookingId', v_booking.id, 'providerId', v_booking.provider_id)
  )
  returning id into v_provider_tx_id;

  update public.bookings
     set payment_status = 'paid'
   where id = v_booking.id;

  return jsonb_build_object(
    'bookingId', v_booking.id,
    'providerId', v_booking.provider_id,
    'amount', v_booking.total_amount,
    'currency', v_booking.currency,
    'customerBalance', v_customer_balance,
    'providerBalance', v_provider_balance,
    'customerTransactionId', v_customer_tx_id,
    'providerTransactionId', v_provider_tx_id
  );
end;
$$;

create or replace function public.recalculate_review_ratings(
  p_provider_id uuid,
  p_service_id uuid
) returns void
language plpgsql
as $$
begin
  if p_provider_id is not null then
    update public.app_users
       set rating_average = coalesce((
             select round(avg(rating)::numeric, 2)
               from public.reviews
              where provider_id = p_provider_id
           ), 0),
           rating_count = (
             select count(*)::integer
               from public.reviews
              where provider_id = p_provider_id
           )
     where id = p_provider_id;
  end if;

  if p_service_id is not null then
    update public.services
       set rating_average = coalesce((
             select round(avg(rating)::numeric, 2)
               from public.reviews
              where service_id = p_service_id
           ), 0),
           rating_count = (
             select count(*)::integer
               from public.reviews
              where service_id = p_service_id
           )
     where id = p_service_id;
  end if;
end;
$$;

create or replace function public.create_review_for_completed_booking(
  p_booking_id uuid,
  p_customer_id uuid,
  p_rating integer,
  p_comment text,
  p_images text[] default '{}'
) returns jsonb
language plpgsql
as $$
declare
  v_booking public.bookings%rowtype;
  v_review_id uuid;
begin
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  select *
    into v_booking
    from public.bookings
   where id = p_booking_id
     and customer_id = p_customer_id
     and status = 'completed'
   for update;

  if not found then
    raise exception 'Booking not found or not completed';
  end if;

  if exists (select 1 from public.reviews where booking_id = p_booking_id) then
    raise exception 'You have already reviewed this booking';
  end if;

  insert into public.reviews (
    customer_id, provider_id, booking_id, service_id, rating, comment, images
  ) values (
    p_customer_id,
    v_booking.provider_id,
    p_booking_id,
    v_booking.service_id,
    p_rating,
    p_comment,
    coalesce(p_images, '{}')
  )
  returning id into v_review_id;

  update public.bookings
     set rating = jsonb_build_object(
       'value', p_rating,
       'comment', p_comment,
       'date', timezone('utc', now())
     )
   where id = p_booking_id;

  perform public.recalculate_review_ratings(v_booking.provider_id, v_booking.service_id);

  return jsonb_build_object('reviewId', v_review_id);
end;
$$;

create or replace function public.delete_review_and_recalculate_ratings(
  p_review_id uuid
) returns jsonb
language plpgsql
as $$
declare
  v_review public.reviews%rowtype;
begin
  select *
    into v_review
    from public.reviews
   where id = p_review_id
   for update;

  if not found then
    raise exception 'Review not found';
  end if;

  delete from public.reviews where id = p_review_id;

  update public.bookings
     set rating = null
   where id = v_review.booking_id;

  perform public.recalculate_review_ratings(v_review.provider_id, v_review.service_id);

  return jsonb_build_object(
    'deleted', true,
    'review', to_jsonb(v_review)
  );
end;
$$;

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant execute on function public.credit_wallet_from_pending_transaction(uuid, text, numeric) to service_role;
grant execute on function public.create_manual_wallet_credit(uuid, numeric, text, text, text, jsonb) to service_role;
grant execute on function public.create_wallet_withdrawal_debit(uuid, numeric, text, text, text, jsonb) to service_role;
grant execute on function public.refund_wallet_withdrawal(uuid, text) to service_role;
grant execute on function public.process_booking_wallet_payment(uuid, uuid, text, text) to service_role;
grant execute on function public.recalculate_review_ratings(uuid, uuid) to service_role;
grant execute on function public.create_review_for_completed_booking(uuid, uuid, integer, text, text[]) to service_role;
grant execute on function public.delete_review_and_recalculate_ratings(uuid) to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
