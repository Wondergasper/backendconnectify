const test = require('node:test');
const assert = require('node:assert/strict');

const { ServiceRepository } = require('../repositories/supabase/serviceRepository');
const { AvailabilityRepository, generateDefaultSlots, normalizeDateString } = require('../repositories/supabase/availabilityRepository');
const { mapAvailabilityRow } = require('../repositories/supabase/mappers');

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
    neq: (key, value) => {
      calls.push(['neq', key, value]);
      return query;
    },
    ilike: (key, value) => {
      calls.push(['ilike', key, value]);
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
      data = { ...payload, id: 'new-id', created_at: 'now', updated_at: 'now' };
      return query;
    },
    update: (payload) => {
      calls.push(['update', payload]);
      data = { ...data, ...payload };
      return query;
    },
    delete: () => {
      calls.push(['delete']);
      return query;
    },
    single: () => Promise.resolve({ data, error: null }),
    maybeSingle: () => Promise.resolve({ data, error: null })
  };
  return query;
};

test('ServiceRepository creates service rows with Supabase column names', async () => {
  const calls = [];
  const fakeClient = {
    from: () => makeQuery({}, calls)
  };

  const repo = new ServiceRepository(() => fakeClient);
  const service = await repo.createService({
    providerId: 'provider-1',
    name: 'Cleaning',
    category: 'Home',
    description: 'Deep clean',
    price: 5000,
    priceType: 'fixed',
    duration: 120,
    images: ['a.png'],
    location: { address: 'Lagos' },
    servicesOffered: ['Dusting']
  });

  assert.equal(service._id, 'new-id');
  assert.deepEqual(calls.find((call) => call[0] === 'insert')[1], {
    provider_id: 'provider-1',
    name: 'Cleaning',
    category: 'Home',
    description: 'Deep clean',
    price: 5000,
    price_type: 'fixed',
    duration_minutes: 120,
    images: ['a.png'],
    location: { address: 'Lagos' },
    services_offered: ['Dusting']
  });
});

test('ServiceRepository list applies active, category, price, rating and search filters', async () => {
  const calls = [];
  const fakeClient = {
    from: () => makeQuery([], calls, 0)
  };

  const repo = new ServiceRepository(() => fakeClient);
  await repo.listServices({
    page: 2,
    limit: 5,
    category: 'Cleaning',
    search: 'deep',
    minPrice: 1000,
    maxPrice: 10000,
    minRating: 4
  });

  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'is_active' && call[2] === true));
  assert.ok(calls.some((call) => call[0] === 'ilike' && call[1] === 'category'));
  assert.ok(calls.some((call) => call[0] === 'gte' && call[1] === 'price' && call[2] === 1000));
  assert.ok(calls.some((call) => call[0] === 'lte' && call[1] === 'price' && call[2] === 10000));
  assert.ok(calls.some((call) => call[0] === 'gte' && call[1] === 'rating_average' && call[2] === 4));
  assert.ok(calls.some((call) => call[0] === 'or' && call[1].includes('name.ilike.%deep%')));
  assert.ok(calls.some((call) => call[0] === 'range' && call[1] === 5 && call[2] === 9));
});

test('AvailabilityRepository maps and creates default rows when missing', async () => {
  const calls = [];
  let first = true;
  const fakeClient = {
    from: () => {
      if (first) {
        first = false;
        return makeQuery(null, calls);
      }
      return makeQuery({}, calls);
    }
  };

  const repo = new AvailabilityRepository(() => fakeClient);
  const availability = await repo.getOrCreate({ providerId: 'provider-1', date: '2026-05-21' });

  assert.equal(availability._id, 'new-id');
  assert.equal(availability.provider, 'provider-1');
  assert.equal(availability.date, '2026-05-21');
  assert.equal(availability.slots.length, 12);
  assert.deepEqual(calls.find((call) => call[0] === 'insert')[1].slots, generateDefaultSlots());
});

test('mapAvailabilityRow preserves the current API names', () => {
  const row = mapAvailabilityRow({
    id: 'availability-1',
    provider_id: 'provider-1',
    date: '2026-05-21',
    slots: [{ startTime: '08:00', endTime: '09:00', isBooked: false, bookingId: null }],
    is_available: true
  });

  assert.equal(row._id, 'availability-1');
  assert.equal(row.provider, 'provider-1');
  assert.equal(row.isAvailable, true);
  assert.equal(normalizeDateString('2026-05-21T13:00:00.000Z'), '2026-05-21');
});
