const test = require('node:test');
const assert = require('node:assert/strict');

const { VerificationRepository } = require('../repositories/supabase/verificationRepository');
const { mapVerificationRow } = require('../repositories/supabase/mappers');

const makeResultQuery = (data, error = null, count = null) => {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    single: () => Promise.resolve({ data, error }),
    maybeSingle: () => Promise.resolve({ data, error }),
    insert: () => query,
    update: () => query,
    upsert: () => query,
    order: () => query,
    range: () => Promise.resolve({ data, error, count })
  };
  return query;
};

test('mapVerificationRow maps columns correctly to camelCase', () => {
  const dbRow = {
    id: 'verify-123',
    user_id: 'user-1',
    user: { id: 'user-1', name: 'Provider One', email: 'provider@example.com' },
    document_type: 'PASSPORT',
    document_number: 'PP12345',
    document_front: 'http://front.url',
    document_back: 'http://back.url',
    status: 'PENDING',
    verified_by: { id: 'admin-1', name: 'Admin One', email: 'admin@example.com' },
    verification_date: '2026-05-21T10:00:00Z',
    rejection_reason: null,
    additional_info: { note: 'checked' },
    created_at: '2026-05-21T09:00:00Z',
    updated_at: '2026-05-21T09:30:00Z'
  };

  const mapped = mapVerificationRow(dbRow);

  assert.equal(mapped._id, 'verify-123');
  assert.equal(mapped.id, 'verify-123');
  assert.equal(mapped.documentType, 'PASSPORT');
  assert.equal(mapped.documentNumber, 'PP12345');
  assert.equal(mapped.documentFront, 'http://front.url');
  assert.equal(mapped.documentBack, 'http://back.url');
  assert.equal(mapped.status, 'PENDING');
  assert.equal(mapped.verifiedBy._id, 'admin-1');
  assert.equal(mapped.verifiedBy.name, 'Admin One');
  assert.equal(mapped.verificationDate, '2026-05-21T10:00:00Z');
  assert.deepEqual(mapped.additionalInfo, { note: 'checked' });
  assert.equal(mapped.user._id, 'user-1');
  assert.equal(mapped.user.name, 'Provider One');
});

test('VerificationRepository findById returns mapped request', async () => {
  const fakeRow = {
    id: 'verify-123',
    user_id: 'user-1',
    document_type: 'PASSPORT',
    document_number: 'PP12345',
    document_front: 'http://front.url',
    status: 'PENDING'
  };

  const fakeClient = {
    from: () => makeResultQuery(fakeRow)
  };

  const repo = new VerificationRepository(() => fakeClient);
  const result = await repo.findById('verify-123');

  assert.equal(result.id, 'verify-123');
  assert.equal(result.documentType, 'PASSPORT');
  assert.equal(result.status, 'PENDING');
});

test('VerificationRepository findByUserId returns mapped request', async () => {
  const fakeRow = {
    id: 'verify-123',
    user_id: 'user-1',
    document_type: 'PASSPORT',
    document_number: 'PP12345',
    document_front: 'http://front.url',
    status: 'PENDING'
  };

  const fakeClient = {
    from: () => makeResultQuery(fakeRow)
  };

  const repo = new VerificationRepository(() => fakeClient);
  const result = await repo.findByUserId('user-1');

  assert.equal(result.id, 'verify-123');
  assert.equal(result.user, 'user-1'); // mapped to ID because user was not joined in fake row
  assert.equal(result.status, 'PENDING');
});

test('VerificationRepository upsertVerification returns mapped request', async () => {
  const fakeRow = {
    id: 'verify-123',
    user_id: 'user-1',
    document_type: 'PASSPORT',
    document_number: 'PP12345',
    document_front: 'http://front.url',
    status: 'PENDING'
  };

  const fakeClient = {
    from: () => makeResultQuery(fakeRow)
  };

  const repo = new VerificationRepository(() => fakeClient);
  const result = await repo.upsertVerification({
    userId: 'user-1',
    documentType: 'PASSPORT',
    documentNumber: 'PP12345',
    documentFront: 'http://front.url',
    documentBack: 'http://back.url',
    additionalInfo: { extra: 'info' }
  });

  assert.equal(result.id, 'verify-123');
  assert.equal(result.documentType, 'PASSPORT');
  assert.equal(result.status, 'PENDING');
});

test('VerificationRepository lists verification requests with status filter', async () => {
  const fakeRows = [
    {
      id: 'verify-123',
      user_id: 'user-1',
      document_type: 'PASSPORT',
      document_number: 'PP12345',
      document_front: 'http://front.url',
      status: 'PENDING'
    }
  ];

  const fakeClient = {
    from: () => makeResultQuery(fakeRows, null, 1)
  };

  const repo = new VerificationRepository(() => fakeClient);
  const result = await repo.listVerifications({
    page: 1,
    limit: 10,
    status: 'PENDING'
  });

  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].id, 'verify-123');
  assert.equal(result.pagination.total, 1);
  assert.equal(result.pagination.page, 1);
});

test('VerificationRepository approveVerification sets approved status', async () => {
  const fakeRow = {
    id: 'verify-123',
    user_id: 'user-1',
    document_type: 'PASSPORT',
    document_number: 'PP12345',
    document_front: 'http://front.url',
    status: 'APPROVED',
    verified_by: 'admin-1',
    verification_date: '2026-05-21T10:00:00Z'
  };

  const fakeClient = {
    from: () => makeResultQuery(fakeRow)
  };

  const repo = new VerificationRepository(() => fakeClient);
  const result = await repo.approveVerification('verify-123', 'admin-1');

  assert.equal(result.status, 'APPROVED');
  assert.equal(result.verifiedBy, 'admin-1');
  assert.equal(result.verificationDate, '2026-05-21T10:00:00Z');
});

test('VerificationRepository rejectVerification sets rejected status', async () => {
  const fakeRow = {
    id: 'verify-123',
    user_id: 'user-1',
    document_type: 'PASSPORT',
    document_number: 'PP12345',
    document_front: 'http://front.url',
    status: 'REJECTED',
    verified_by: 'admin-1',
    verification_date: '2026-05-21T10:00:00Z',
    rejection_reason: 'Bad image quality'
  };

  const fakeClient = {
    from: () => makeResultQuery(fakeRow)
  };

  const repo = new VerificationRepository(() => fakeClient);
  const result = await repo.rejectVerification('verify-123', 'admin-1', 'Bad image quality');

  assert.equal(result.status, 'REJECTED');
  assert.equal(result.verifiedBy, 'admin-1');
  assert.equal(result.rejectionReason, 'Bad image quality');
});
