const test = require('node:test');
const assert = require('node:assert/strict');

const { WalletRepository } = require('../repositories/supabase/walletRepository');

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
      data = { ...payload, id: 'tx-1', created_at: 'now', updated_at: 'now' };
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

test('WalletRepository creates wallet transactions with Supabase column names', async () => {
  const calls = [];
  const fakeClient = {
    from: () => makeQuery({}, calls)
  };

  const repo = new WalletRepository(() => fakeClient);
  const tx = await repo.createTransaction({
    userId: 'user-1',
    type: 'credit',
    amount: 5000,
    currency: 'NGN',
    description: 'Wallet top-up via Paystack',
    reference: 'DEP_1',
    status: 'pending',
    metadata: { paymentMethod: 'paystack' }
  });

  assert.equal(tx._id, 'tx-1');
  assert.deepEqual(calls.find((call) => call[0] === 'insert')[1], {
    user_id: 'user-1',
    type: 'credit',
    amount: 5000,
    currency: 'NGN',
    description: 'Wallet top-up via Paystack',
    reference: 'DEP_1',
    status: 'pending',
    metadata: { paymentMethod: 'paystack' }
  });
});

test('WalletRepository lists transactions with user, type, and pagination filters', async () => {
  const calls = [];
  const fakeClient = {
    from: () => makeQuery([], calls, 0)
  };

  const repo = new WalletRepository(() => fakeClient);
  const result = await repo.listTransactions({
    userId: 'user-1',
    type: 'debit',
    page: 3,
    limit: 20
  });

  assert.equal(result.pagination.page, 3);
  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'user-1'));
  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'type' && call[2] === 'debit'));
  assert.ok(calls.some((call) => call[0] === 'range' && call[1] === 40 && call[2] === 59));
});

test('WalletRepository credits pending top-ups through a Postgres RPC', async () => {
  const calls = [];
  const fakeClient = {
    rpc: (name, args) => {
      calls.push(['rpc', name, args]);
      return Promise.resolve({
        data: { balance: 7000, currency: 'NGN', amountAdded: 5000, alreadyCompleted: false },
        error: null
      });
    }
  };

  const repo = new WalletRepository(() => fakeClient);
  const result = await repo.creditPendingTopup({
    userId: 'user-1',
    reference: 'DEP_1',
    amount: 5000
  });

  assert.equal(result.balance, 7000);
  assert.deepEqual(calls[0], ['rpc', 'credit_wallet_from_pending_transaction', {
    p_user_id: 'user-1',
    p_reference: 'DEP_1',
    p_amount: 5000
  }]);
});

test('WalletRepository processes booking payments through a Postgres RPC', async () => {
  const calls = [];
  const fakeClient = {
    rpc: (name, args) => {
      calls.push(['rpc', name, args]);
      return Promise.resolve({
        data: {
          bookingId: 'booking-1',
          customerBalance: 2000,
          providerBalance: 12000,
          amount: 10000
        },
        error: null
      });
    }
  };

  const repo = new WalletRepository(() => fakeClient);
  const result = await repo.processBookingPayment({
    bookingId: 'booking-1',
    customerId: 'customer-1',
    customerReference: 'PAY_1',
    providerReference: 'RECV_1'
  });

  assert.equal(result.amount, 10000);
  assert.deepEqual(calls[0], ['rpc', 'process_booking_wallet_payment', {
    p_booking_id: 'booking-1',
    p_customer_id: 'customer-1',
    p_customer_reference: 'PAY_1',
    p_provider_reference: 'RECV_1'
  }]);
});
