const test = require('node:test');
const assert = require('node:assert/strict');

const { BookingRepository } = require('../repositories/supabase/bookingRepository');

const makeQuery = (initialData, calls, count = null) => {
  let data = initialData;
  const query = {
    select: (value, options) => {
      calls.push(['select', value, options]);
      return query;
    },
    eq: (key, value) => {
      calls.push(['eq', key, value]);
      return query;
    },
    or: (value) => {
      calls.push(['or', value]);
      return query;
    },
    gte: (key, value) => {
      calls.push(['gte', key, value]);
      return query;
    },
    lte: (key, value) => {
      calls.push(['lte', key, value]);
      return query;
    },
    order: (key, options) => {
      calls.push(['order', key, options]);
      return query;
    },
    range: (from, to) => {
      calls.push(['range', from, to]);
      return Promise.resolve({ data, error: null, count });
    },
    insert: (payload) => {
      calls.push(['insert', payload]);
      data = { ...payload, id: payload.id || 'booking-1', created_at: 'now', updated_at: 'now' };
      return query;
    },
    update: (payload) => {
      calls.push(['update', payload]);
      data = { ...data, ...payload };
      return query;
    },
    single: () => Promise.resolve({ data, error: null }),
    maybeSingle: () => Promise.resolve({ data, error: null })
  };
  return query;
};

test('BookingRepository creates booking rows with Supabase column names', async () => {
  const calls = [];
  const fakeClient = {
    from: () => makeQuery({}, calls)
  };

  const repo = new BookingRepository(() => fakeClient);
  const booking = await repo.createBooking({
    id: 'booking-1',
    customerId: 'customer-1',
    providerId: 'provider-1',
    serviceId: 'service-1',
    date: '2026-05-21T13:30:00.000Z',
    time: '09:00',
    duration: 60,
    totalAmount: 12000,
    notes: 'Bring tools',
    address: { city: 'Ikeja' }
  });

  assert.equal(booking._id, 'booking-1');
  assert.deepEqual(calls.find((call) => call[0] === 'insert')[1], {
    id: 'booking-1',
    customer_id: 'customer-1',
    provider_id: 'provider-1',
    service_id: 'service-1',
    date: '2026-05-21',
    start_time: '09:00',
    duration_minutes: 60,
    status: 'pending',
    total_amount: 12000,
    currency: 'NGN',
    payment_status: 'pending',
    notes: 'Bring tools',
    address: { city: 'Ikeja' }
  });
});

test('BookingRepository lists bookings for both customer and provider roles', async () => {
  const calls = [];
  const fakeClient = {
    from: () => makeQuery([], calls, 0)
  };

  const repo = new BookingRepository(() => fakeClient);
  const result = await repo.listUserBookings({
    userId: 'user-1',
    page: 2,
    limit: 5,
    status: 'confirmed'
  });

  assert.equal(result.pagination.page, 2);
  assert.ok(calls.some((call) => call[0] === 'or' && call[1] === 'customer_id.eq."user-1",provider_id.eq."user-1"'));
  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'status' && call[2] === 'confirmed'));
  assert.ok(calls.some((call) => call[0] === 'range' && call[1] === 5 && call[2] === 9));
});

test('BookingRepository maps status updates to Supabase columns', async () => {
  const calls = [];
  const fakeClient = {
    from: () => makeQuery({ id: 'booking-1', customer_id: 'customer-1' }, calls)
  };

  const repo = new BookingRepository(() => fakeClient);
  const booking = await repo.updateBooking('booking-1', {
    status: 'completed',
    paymentStatus: 'paid',
    completedAt: '2026-05-21T10:00:00.000Z',
    reminderSent: true
  });

  assert.equal(booking.status, 'completed');
  assert.deepEqual(calls.find((call) => call[0] === 'update')[1], {
    status: 'completed',
    payment_status: 'paid',
    completed_at: '2026-05-21T10:00:00.000Z',
    reminder_sent: true
  });
  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'id' && call[2] === 'booking-1'));
});

test('BookingRepository finds upcoming reminders by date and status', async () => {
  const calls = [];
  const fakeClient = {
    from: () => makeQuery([], calls)
  };

  const repo = new BookingRepository(() => fakeClient);
  await repo.listUpcomingReminders(new Date('2026-05-21T12:00:00.000Z'));

  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'status' && call[2] === 'confirmed'));
  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'reminder_sent' && call[2] === false));
  assert.ok(calls.some((call) => call[0] === 'gte' && call[1] === 'date' && call[2] === '2026-05-22'));
  assert.ok(calls.some((call) => call[0] === 'lte' && call[1] === 'date' && call[2] === '2026-05-22'));
});

test('BookingRepository invokes create_booking_atomic RPC', async () => {
  const calls = [];
  const fakeClient = {
    from: () => makeQuery({ id: 'booking-1', customer_id: 'customer-1' }, calls),
    rpc: (name, args) => {
      calls.push(['rpc', name, args]);
      return Promise.resolve({ data: { id: 'booking-1' }, error: null });
    }
  };

  const repo = new BookingRepository(() => fakeClient);
  const booking = await repo.createBookingAtomic({
    id: 'booking-1',
    customerId: 'customer-1',
    providerId: 'provider-1',
    serviceId: 'service-1',
    date: '2026-05-21T13:30:00.000Z',
    time: '09:00',
    duration: 60,
    totalAmount: 12000,
    notes: 'Bring tools',
    address: { city: 'Ikeja' }
  });

  assert.equal(booking._id, 'booking-1');
  assert.deepEqual(calls.find((call) => call[0] === 'rpc'), ['rpc', 'create_booking_atomic', {
    p_booking_id: 'booking-1',
    p_customer_id: 'customer-1',
    p_provider_id: 'provider-1',
    p_service_id: 'service-1',
    p_date: '2026-05-21',
    p_time: '09:00',
    p_duration: 60,
    p_total_amount: 12000,
    p_notes: 'Bring tools',
    p_address: { city: 'Ikeja' }
  }]);
});

test('BookingRepository invokes update_booking_status_atomic RPC', async () => {
  const calls = [];
  const fakeClient = {
    from: () => makeQuery({ id: 'booking-1', customer_id: 'customer-1', status: 'rescheduled' }, calls),
    rpc: (name, args) => {
      calls.push(['rpc', name, args]);
      return Promise.resolve({ data: { id: 'booking-1' }, error: null });
    }
  };

  const repo = new BookingRepository(() => fakeClient);
  const booking = await repo.updateBookingStatusAtomic({
    bookingId: 'booking-1',
    userId: 'provider-1',
    status: 'rescheduled',
    newDate: '2026-05-22',
    newTime: '10:00',
    duration: 90,
    notes: 'New notes',
    address: { street: 'Main' },
    completedAt: '2026-05-21T10:00:00Z'
  });

  assert.equal(booking._id, 'booking-1');
  assert.deepEqual(calls.find((call) => call[0] === 'rpc'), ['rpc', 'update_booking_status_atomic', {
    p_booking_id: 'booking-1',
    p_user_id: 'provider-1',
    p_status: 'rescheduled',
    p_new_date: '2026-05-22',
    p_new_time: '10:00',
    p_duration: 90,
    p_notes: 'New notes',
    p_address: { street: 'Main' },
    p_completed_at: '2026-05-21T10:00:00Z'
  }]);
});
