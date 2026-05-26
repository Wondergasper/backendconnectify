const test = require('node:test');
const assert = require('node:assert/strict');

const { UserRepository } = require('../repositories/supabase/userRepository');
const { mapUserRow } = require('../repositories/supabase/mappers');

const makeQuery = (initialData, calls, count = null) => {
  let data = initialData;
  const query = {
    select: (value) => {
      calls.push(['select', value]);
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
    order: (key, options) => {
      calls.push(['order', key, options]);
      return query;
    },
    range: (from, to) => {
      calls.push(['range', from, to]);
      return Promise.resolve({ data, error: null, count });
    },
    limit: (value) => {
      calls.push(['limit', value]);
      return query;
    },
    insert: (payload) => {
      calls.push(['insert', payload]);
      data = { ...payload, id: 'user-1', created_at: 'now', updated_at: 'now' };
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

test('mapUserRow does not expose password or token secrets', () => {
  const user = mapUserRow({
    id: 'user-1',
    name: 'Ada',
    email: 'ada@example.com',
    phone: '+2348012345678',
    password_hash: 'hash',
    refresh_token_hash: 'refresh-hash',
    reset_password_token: 'reset-hash'
  });

  assert.equal(user.password, undefined);
  assert.equal(user.passwordHash, undefined);
  assert.equal(user.refreshToken, undefined);
  assert.equal(user.refreshTokenHash, undefined);
  assert.equal(user.resetPasswordToken, undefined);
});

test('UserRepository creates a user with a stored password hash', async () => {
  const calls = [];
  const fakeClient = {
    from: (table) => {
      calls.push(['from', table]);
      return makeQuery({}, calls);
    }
  };

  const repo = new UserRepository(() => fakeClient);
  const user = await repo.createUser({
    name: 'Ada',
    email: 'ada@example.com',
    phone: '+2348012345678',
    passwordHash: 'hashed-password',
    role: 'customer'
  });

  assert.equal(user._id, 'user-1');
  assert.deepEqual(calls.find((call) => call[0] === 'insert')[1], {
    name: 'Ada',
    email: 'ada@example.com',
    phone: '+2348012345678',
    password_hash: 'hashed-password',
    role: 'customer'
  });
});

test('UserRepository returns private auth fields only from private lookup', async () => {
  const calls = [];
  const fakeClient = {
    from: () => makeQuery({
      id: 'user-1',
      name: 'Ada',
      email: 'ada@example.com',
      phone: '+2348012345678',
      role: 'customer',
      is_active: true,
      password_hash: 'hashed-password',
      refresh_token_hash: 'refresh-hash'
    }, calls)
  };

  const repo = new UserRepository(() => fakeClient);
  const user = await repo.findForLogin({ email: 'ada@example.com' });

  assert.equal(user._id, 'user-1');
  assert.equal(user.passwordHash, 'hashed-password');
  assert.equal(user.refreshTokenHash, 'refresh-hash');
  assert.ok(calls.some((call) => call[0] === 'or' && call[1].includes('email.eq."ada@example.com"')));
});
