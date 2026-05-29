-- Fix: Column-value order mismatch in create_booking_atomic
-- Previously: values started with p_total_amount where 'pending' (status) was expected.
-- This caused: status=p_total_amount, total_amount='NGN', currency='pending', payment_status='pending'.
-- Corrected order: 'pending' → status, p_total_amount → total_amount, 'NGN' → currency, 'pending' → payment_status.

create or replace function public.create_booking_atomic(
  p_booking_id uuid,
  p_customer_id uuid,
  p_provider_id uuid,
  p_service_id uuid,
  p_date date,
  p_time time,
  p_duration integer,
  p_total_amount numeric,
  p_notes text default null,
  p_address jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avail_id uuid;
  v_slots jsonb;
  v_updated_slots jsonb;
  v_slot jsonb;
  v_found boolean := false;
  v_booking public.bookings%rowtype;
  v_res jsonb;
begin
  -- 1. Lock and fetch availability row for this provider on this date
  select id, slots
    into v_avail_id, v_slots
    from public.availability
   where provider_id = p_provider_id
     and date = p_date
     for update;

  if v_avail_id is null then
    raise exception 'No availability found for provider on this date';
  end if;

  -- 2. Find and mark the matching time slot as booked
  v_updated_slots := '[]'::jsonb;
  for v_slot in select * from jsonb_array_elements(v_slots)
  loop
    if (v_slot->>'time') = p_time::text and (v_slot->>'available')::boolean = true then
      v_slot := v_slot || '{"available": false}'::jsonb;
      v_found := true;
    end if;
    v_updated_slots := v_updated_slots || jsonb_build_array(v_slot);
  end loop;

  if not v_found then
    raise exception 'Time slot not found';
  end if;

  -- 3. Update the availability slots
  update public.availability 
     set slots = v_updated_slots 
   where id = v_avail_id;

  -- 4. Create the booking (FIXED: values now match column order exactly)
  insert into public.bookings (
    id,
    customer_id,
    provider_id,
    service_id,
    date,
    start_time,
    duration_minutes,
    status,          -- 'pending'
    total_amount,    -- p_total_amount
    currency,        -- 'NGN'
    payment_status,  -- 'pending'
    notes,
    address
  ) values (
    p_booking_id,
    p_customer_id,
    p_provider_id,
    p_service_id,
    p_date,
    p_time,
    p_duration,
    'pending',       -- status
    p_total_amount,  -- total_amount
    'NGN',           -- currency
    'pending',       -- payment_status
    p_notes,
    coalesce(p_address, '{}'::jsonb)
  )
  returning * into v_booking;

  -- 5. Return booking row as jsonb
  select to_jsonb(b) into v_res from public.bookings b where b.id = p_booking_id;
  return v_res;
end;
$$;
