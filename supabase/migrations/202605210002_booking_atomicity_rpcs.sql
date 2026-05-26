-- Migration: Tighten Booking/Availability Atomicity via Postgres RPCs
-- Path: backendconnectify/supabase/migrations/202605210002_booking_atomicity_rpcs.sql

create or replace function public.generate_default_slots()
returns jsonb
language plpgsql
as $$
declare
  v_slots jsonb := '[]'::jsonb;
  v_hour integer;
begin
  for v_hour in 8..19 loop
    v_slots := v_slots || jsonb_build_array(
      jsonb_build_object(
        'startTime', to_char(v_hour, 'FM00') || ':00',
        'endTime', to_char(v_hour + 1, 'FM00') || ':00',
        'isBooked', false,
        'bookingId', null
      )
    );
  end loop;
  return v_slots;
end;
$$;

create or replace function public.create_booking_atomic(
  p_booking_id uuid,
  p_customer_id uuid,
  p_provider_id uuid,
  p_service_id uuid,
  p_date date,
  p_time text,
  p_duration integer,
  p_total_amount numeric,
  p_notes text default null,
  p_address jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_avail_id uuid;
  v_slots jsonb;
  v_slot jsonb;
  v_updated_slots jsonb := '[]'::jsonb;
  v_found boolean := false;
  v_is_booked boolean;
  v_start_time text;
  v_booking public.bookings%rowtype;
  v_res jsonb;
begin
  -- 1. Ensure availability row exists and lock it
  select id into v_avail_id 
    from public.availability 
   where provider_id = p_provider_id 
     and date = p_date;

  if not found then
    insert into public.availability (provider_id, date, slots, is_available)
    values (p_provider_id, p_date, public.generate_default_slots(), true)
    returning id into v_avail_id;
  end if;

  -- Lock availability row
  select slots into v_slots 
    from public.availability 
   where id = v_avail_id 
     for update;

  -- 2. Scan and book the slot in the slots array
  for v_slot in select * from jsonb_array_elements(v_slots) loop
    v_start_time := v_slot->>'startTime';
    if v_start_time = p_time then
      v_found := true;
      v_is_booked := (v_slot->>'isBooked')::boolean;
      if v_is_booked then
        raise exception 'Time slot is already booked';
      end if;
      v_slot := jsonb_set(v_slot, '{isBooked}', 'true'::jsonb);
      v_slot := jsonb_set(v_slot, '{bookingId}', to_jsonb(p_booking_id::text));
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

  -- 4. Create the booking
  insert into public.bookings (
    id,
    customer_id,
    provider_id,
    service_id,
    date,
    start_time,
    duration_minutes,
    status,
    total_amount,
    currency,
    payment_status,
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
    p_total_amount,
    'NGN',
    'pending',
    'pending',
    p_notes,
    coalesce(p_address, '{}'::jsonb)
  )
  returning * into v_booking;

  -- 5. Return booking row as jsonb
  select to_jsonb(b) into v_res from public.bookings b where b.id = p_booking_id;
  return v_res;
end;
$$;

create or replace function public.update_booking_status_atomic(
  p_booking_id uuid,
  p_user_id uuid,
  p_status text,
  p_new_date date default null,
  p_new_time text default null,
  p_duration integer default null,
  p_notes text default null,
  p_address jsonb default null,
  p_completed_at timestamptz default null
) returns jsonb
language plpgsql
as $$
declare
  v_booking public.bookings%rowtype;
  v_user_role text;
  v_old_date date;
  v_old_time text;
  v_avail_id uuid;
  v_slots jsonb;
  v_slot jsonb;
  v_updated_slots jsonb;
  v_found boolean;
  v_is_booked boolean;
  v_start_time text;
  v_res jsonb;
begin
  -- 1. Fetch and lock booking
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found';
  end if;

  -- 2. Verify permission
  select role into v_user_role from public.app_users where id = p_user_id;
  if not found then
    raise exception 'User not found';
  end if;

  if v_user_role <> 'admin' and v_booking.provider_id <> p_user_id then
    if v_booking.customer_id = p_user_id then
      if p_status not in ('cancelled', 'rescheduled') then
        raise exception 'Access denied: customers can only cancel or reschedule bookings';
      end if;
    else
      raise exception 'Access denied';
    end if;
  end if;

  v_old_date := v_booking.date;
  v_old_time := v_booking.start_time;

  -- 3. Process status logic
  if p_status = 'rescheduled' then
    if p_new_date is null or p_new_time is null then
      raise exception 'New date and time are required for rescheduling';
    end if;

    -- Lock both availability dates in sorted order to avoid deadlock
    if v_old_date < p_new_date then
      perform 1 from public.availability 
       where provider_id = v_booking.provider_id and date = v_old_date for update;
      
      select id into v_avail_id from public.availability
       where provider_id = v_booking.provider_id and date = p_new_date;
      if not found then
        insert into public.availability (provider_id, date, slots, is_available)
        values (v_booking.provider_id, p_new_date, public.generate_default_slots(), true)
        returning id into v_avail_id;
      end if;
      perform 1 from public.availability where id = v_avail_id for update;
    elsif v_old_date > p_new_date then
      select id into v_avail_id from public.availability
       where provider_id = v_booking.provider_id and date = p_new_date;
      if not found then
        insert into public.availability (provider_id, date, slots, is_available)
        values (v_booking.provider_id, p_new_date, public.generate_default_slots(), true)
        returning id into v_avail_id;
      end if;
      perform 1 from public.availability where id = v_avail_id for update;

      perform 1 from public.availability 
       where provider_id = v_booking.provider_id and date = v_old_date for update;
    else
      perform 1 from public.availability 
       where provider_id = v_booking.provider_id and date = v_old_date for update;
    end if;

    -- Unbook old slot
    select slots into v_slots from public.availability 
     where provider_id = v_booking.provider_id and date = v_old_date;
    v_updated_slots := '[]'::jsonb;
    v_found := false;
    for v_slot in select * from jsonb_array_elements(v_slots) loop
      v_start_time := v_slot->>'startTime';
      if v_start_time = v_old_time and (v_slot->>'bookingId') = p_booking_id::text then
        v_found := true;
        v_slot := jsonb_set(v_slot, '{isBooked}', 'false'::jsonb);
        v_slot := jsonb_set(v_slot, '{bookingId}', 'null'::jsonb);
      end if;
      v_updated_slots := v_updated_slots || jsonb_build_array(v_slot);
    end loop;
    if v_found then
      update public.availability set slots = v_updated_slots
       where provider_id = v_booking.provider_id and date = v_old_date;
    end if;

    -- Book new slot
    select slots into v_slots from public.availability 
     where provider_id = v_booking.provider_id and date = p_new_date;
    v_updated_slots := '[]'::jsonb;
    v_found := false;
    for v_slot in select * from jsonb_array_elements(v_slots) loop
      v_start_time := v_slot->>'startTime';
      if v_start_time = p_new_time then
        v_found := true;
        v_is_booked := (v_slot->>'isBooked')::boolean;
        if v_is_booked and (v_slot->>'bookingId') <> p_booking_id::text then
          raise exception 'Time slot is already booked';
        end if;
        v_slot := jsonb_set(v_slot, '{isBooked}', 'true'::jsonb);
        v_slot := jsonb_set(v_slot, '{bookingId}', to_jsonb(p_booking_id::text));
      end if;
      v_updated_slots := v_updated_slots || jsonb_build_array(v_slot);
    end loop;
    if not v_found then
      raise exception 'Time slot not found';
    end if;
    update public.availability set slots = v_updated_slots
     where provider_id = v_booking.provider_id and date = p_new_date;

    -- Update booking columns
    update public.bookings
       set status = 'rescheduled',
           date = p_new_date,
           start_time = p_new_time,
           duration_minutes = coalesce(p_duration, duration_minutes),
           notes = coalesce(p_notes, notes),
           address = coalesce(p_address, address)
     where id = p_booking_id;

  elsif p_status in ('cancelled', 'rejected') then
    -- Release slot
    perform 1 from public.availability 
     where provider_id = v_booking.provider_id and date = v_old_date for update;
    
    select slots into v_slots from public.availability 
     where provider_id = v_booking.provider_id and date = v_old_date;
    v_updated_slots := '[]'::jsonb;
    v_found := false;
    for v_slot in select * from jsonb_array_elements(v_slots) loop
      v_start_time := v_slot->>'startTime';
      if v_start_time = v_old_time and (v_slot->>'bookingId') = p_booking_id::text then
        v_found := true;
        v_slot := jsonb_set(v_slot, '{isBooked}', 'false'::jsonb);
        v_slot := jsonb_set(v_slot, '{bookingId}', 'null'::jsonb);
      end if;
      v_updated_slots := v_updated_slots || jsonb_build_array(v_slot);
    end loop;
    if v_found then
      update public.availability set slots = v_updated_slots
       where provider_id = v_booking.provider_id and date = v_old_date;
    end if;

    update public.bookings
       set status = p_status,
           notes = coalesce(p_notes, notes),
           address = coalesce(p_address, address)
     where id = p_booking_id;

  elsif p_status = 'completed' then
    update public.bookings
       set status = 'completed',
           completed_at = coalesce(p_completed_at, timezone('utc', now())),
           notes = coalesce(p_notes, notes),
           address = coalesce(p_address, address)
     where id = p_booking_id;

    if v_booking.status <> 'completed' then
      update public.app_users
         set completed_jobs_count = completed_jobs_count + 1
       where id = v_booking.provider_id;
    end if;

  else
    update public.bookings
       set status = p_status,
           duration_minutes = coalesce(p_duration, duration_minutes),
           notes = coalesce(p_notes, notes),
           address = coalesce(p_address, address)
     where id = p_booking_id;
  end if;

  select to_jsonb(b) into v_res from public.bookings b where b.id = p_booking_id;
  return v_res;
end;
$$;

grant execute on function public.generate_default_slots() to service_role;
grant execute on function public.create_booking_atomic(uuid, uuid, uuid, uuid, date, text, integer, numeric, text, jsonb) to service_role;
grant execute on function public.update_booking_status_atomic(uuid, uuid, text, date, text, integer, text, jsonb, timestamptz) to service_role;
