const test = require('node:test');
const assert = require('node:assert/strict');

const { CategoryRepository } = require('../repositories/supabase/categoryRepository');
const { AuditRepository } = require('../repositories/supabase/auditRepository');

const makeResultQuery = (data, error = null, count = null) => {
  const query = {
    select: () => query,
    eq: () => query,
    neq: () => query,
    ilike: () => query,
    or: () => query,
    order: () => query,
    range: () => Promise.resolve({ data, error, count }),
    single: () => Promise.resolve({ data, error }),
    maybeSingle: () => Promise.resolve({ data, error }),
    insert: () => query,
    update: () => query,
    delete: () => query
  };
  return query;
};

test('CategoryRepository maps category rows to existing API names', async () => {
  const fakeClient = {
    from: () => makeResultQuery({
      id: 'cat-1',
      name: 'Cleaning',
      description: 'Home cleaning',
      icon: 'sparkles',
      is_active: true,
      created_at: '2026-05-20T10:00:00.000Z',
      updated_at: '2026-05-20T11:00:00.000Z'
    })
  };

  const repo = new CategoryRepository(() => fakeClient);
  const category = await repo.findById('cat-1');

  assert.equal(category._id, 'cat-1');
  assert.equal(category.name, 'Cleaning');
  assert.equal(category.isActive, true);
  assert.equal(category.createdAt, '2026-05-20T10:00:00.000Z');
});

test('AuditRepository maps actor data and pagination', async () => {
  const fakeClient = {
    from: () => makeResultQuery([
      {
        id: 'audit-1',
        actor_id: 'user-1',
        actor: { id: 'user-1', name: 'Admin', email: 'admin@example.com', role: 'admin' },
        action: 'Updated user',
        entity_type: 'user',
        entity_id: 'user-2',
        target: 'user@example.com',
        metadata: { field: 'role' },
        ip_address: '127.0.0.1',
        user_agent: 'node-test',
        created_at: '2026-05-20T10:00:00.000Z'
      }
    ], null, 1)
  };

  const repo = new AuditRepository(() => fakeClient);
  const result = await repo.list({ page: 1, limit: 25 });

  assert.equal(result.data[0]._id, 'audit-1');
  assert.equal(result.data[0].actor._id, 'user-1');
  assert.equal(result.data[0].entityType, 'user');
  assert.equal(result.data[0].ipAddress, '127.0.0.1');
  assert.equal(result.pagination.total, 1);
});
