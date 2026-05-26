const test = require('node:test');
const assert = require('node:assert/strict');

const { CardRepository } = require('../repositories/supabase/cardRepository');
const { mapPaymentCardRow, mapPrivatePaymentCardRow } = require('../repositories/supabase/mappers');

const makeResultQuery = (data, error = null, count = null) => {
  const query = {
    select: () => query,
    eq: () => query,
    neq: () => query,
    single: () => Promise.resolve({ data, error }),
    maybeSingle: () => Promise.resolve({ data, error }),
    insert: () => query,
    update: () => query,
    order: () => query,
    range: () => Promise.resolve({ data, error, count }),
    limit: () => query,
    then: (resolve) => resolve({ data, error, count })
  };
  return query;
};

test('mapPaymentCardRow redacts authorizationCode by default', () => {
  const dbRow = {
    id: 'card-123',
    user_id: 'user-1',
    brand: 'Visa',
    last4: '4321',
    expiry_month: '12',
    expiry_year: '2028',
    card_holder_name: 'John Doe',
    authorization_code: 'AUTH_CODE_XYZ',
    provider: 'paystack',
    is_default: true,
    status: 'active',
    created_at: '2026-05-21T09:00:00Z',
    updated_at: '2026-05-21T09:30:00Z'
  };

  const mapped = mapPaymentCardRow(dbRow);

  assert.equal(mapped._id, 'card-123');
  assert.equal(mapped.id, 'card-123');
  assert.equal(mapped.brand, 'Visa');
  assert.equal(mapped.last4, '4321');
  assert.equal(mapped.expiryMonth, '12');
  assert.equal(mapped.expiryYear, '2028');
  assert.equal(mapped.cardHolderName, 'John Doe');
  assert.equal(mapped.isDefault, true);
  assert.equal(mapped.status, 'active');
  assert.equal(mapped.authorizationCode, undefined); // Verified redacted!
});

test('mapPrivatePaymentCardRow preserves authorizationCode', () => {
  const dbRow = {
    id: 'card-123',
    user_id: 'user-1',
    brand: 'Visa',
    last4: '4321',
    expiry_month: '12',
    expiry_year: '2028',
    card_holder_name: 'John Doe',
    authorization_code: 'AUTH_CODE_XYZ',
    provider: 'paystack',
    is_default: true,
    status: 'active'
  };

  const mapped = mapPrivatePaymentCardRow(dbRow);

  assert.equal(mapped.id, 'card-123');
  assert.equal(mapped.authorizationCode, 'AUTH_CODE_XYZ'); // Verified preserved!
});

test('CardRepository listCards returns active cards', async () => {
  const fakeRows = [
    {
      id: 'card-123',
      user_id: 'user-1',
      brand: 'Visa',
      last4: '4321',
      expiry_month: '12',
      expiry_year: '28',
      is_default: true,
      status: 'active'
    }
  ];

  const fakeClient = {
    from: () => makeResultQuery(fakeRows)
  };

  const repo = new CardRepository(() => fakeClient);
  const result = await repo.listCards('user-1');

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'card-123');
  assert.equal(result[0].isDefault, true);
  assert.equal(result[0].authorizationCode, undefined);
});

test('CardRepository countCards returns count of active cards', async () => {
  const fakeClient = {
    from: () => makeResultQuery([], null, 3)
  };

  const repo = new CardRepository(() => fakeClient);
  const count = await repo.countCards('user-1');

  assert.equal(count, 3);
});

test('CardRepository createCard inserts and maps', async () => {
  const fakeRow = {
    id: 'card-123',
    user_id: 'user-1',
    brand: 'Visa',
    last4: '4321',
    expiry_month: '12',
    expiry_year: '28',
    is_default: true,
    status: 'active'
  };

  // Mock double clearDefaults update query
  let clearDefaultsCalled = false;
  const fakeClient = {
    from: (table) => {
      return {
        update: () => {
          clearDefaultsCalled = true;
          return makeResultQuery([]);
        },
        insert: () => makeResultQuery(fakeRow),
        eq: () => makeResultQuery(fakeRow)
      };
    }
  };

  const repo = new CardRepository(() => fakeClient);
  const result = await repo.createCard({
    userId: 'user-1',
    brand: 'Visa',
    last4: '4321',
    expiryMonth: '12',
    expiryYear: '28',
    authorizationCode: 'AUTH_123',
    isDefault: true
  });

  assert.equal(result.id, 'card-123');
  assert.equal(result.isDefault, true);
  assert.equal(clearDefaultsCalled, true);
});

test('CardRepository setDefault sets is_default = true', async () => {
  const fakeRow = {
    id: 'card-123',
    user_id: 'user-1',
    is_default: true
  };

  const fakeClient = {
    from: () => {
      return {
        update: () => makeResultQuery(fakeRow),
        eq: () => makeResultQuery(fakeRow)
      };
    }
  };

  const repo = new CardRepository(() => fakeClient);
  const result = await repo.setDefault('card-123', 'user-1');

  assert.equal(result.isDefault, true);
});

test('CardRepository disableCard sets status to disabled', async () => {
  const fakeRow = {
    id: 'card-123',
    user_id: 'user-1',
    status: 'disabled',
    is_default: false
  };

  const fakeClient = {
    from: () => makeResultQuery(fakeRow)
  };

  const repo = new CardRepository(() => fakeClient);
  const result = await repo.disableCard('card-123', 'user-1');

  assert.equal(result.status, 'disabled');
  assert.equal(result.isDefault, false);
});
