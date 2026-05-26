const test = require('node:test');
const assert = require('node:assert/strict');

const { ReviewRepository } = require('../repositories/supabase/reviewRepository');
const { mapReviewRow } = require('../repositories/supabase/mappers');

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
    ilike: (key, value) => {
      calls.push(['ilike', key, value]);
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
    delete: () => {
      calls.push(['delete']);
      return query;
    },
    maybeSingle: () => Promise.resolve({ data, error: null }),
    single: () => Promise.resolve({ data, error: null })
  };
  return query;
};

test('mapReviewRow preserves the current review API shape', () => {
  const review = mapReviewRow({
    id: 'review-1',
    customer_id: 'customer-1',
    provider_id: 'provider-1',
    booking_id: 'booking-1',
    service_id: 'service-1',
    rating: 5,
    comment: 'Great work',
    images: ['done.png'],
    created_at: '2026-05-21T10:00:00.000Z'
  });

  assert.equal(review._id, 'review-1');
  assert.equal(review.customer, 'customer-1');
  assert.equal(review.provider, 'provider-1');
  assert.equal(review.booking, 'booking-1');
  assert.equal(review.service, 'service-1');
  assert.equal(review.rating, 5);
  assert.deepEqual(review.images, ['done.png']);
});

test('ReviewRepository creates reviews through the completed-booking RPC', async () => {
  const calls = [];
  const fakeClient = {
    rpc: (name, args) => {
      calls.push(['rpc', name, args]);
      return Promise.resolve({ data: { reviewId: 'review-1' }, error: null });
    },
    from: () => makeQuery({ id: 'review-1', rating: 5 }, calls)
  };

  const repo = new ReviewRepository(() => fakeClient);
  const review = await repo.createForCompletedBooking({
    bookingId: 'booking-1',
    customerId: 'customer-1',
    rating: 5,
    comment: 'Great work',
    images: ['done.png']
  });

  assert.equal(review._id, 'review-1');
  assert.deepEqual(calls[0], ['rpc', 'create_review_for_completed_booking', {
    p_booking_id: 'booking-1',
    p_customer_id: 'customer-1',
    p_rating: 5,
    p_comment: 'Great work',
    p_images: ['done.png']
  }]);
  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'id' && call[2] === 'review-1'));
});

test('ReviewRepository lists service reviews with pagination', async () => {
  const calls = [];
  const fakeClient = {
    from: () => makeQuery([], calls, 0)
  };

  const repo = new ReviewRepository(() => fakeClient);
  const result = await repo.listByService({ serviceId: 'service-1', page: 2, limit: 5 });

  assert.equal(result.pagination.page, 2);
  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'service_id' && call[2] === 'service-1'));
  assert.ok(calls.some((call) => call[0] === 'range' && call[1] === 5 && call[2] === 9));
});

test('ReviewRepository deletes reviews through an RPC so ratings are recalculated', async () => {
  const calls = [];
  const fakeClient = {
    rpc: (name, args) => {
      calls.push(['rpc', name, args]);
      return Promise.resolve({ data: { deleted: true, review: { id: 'review-1', rating: 4 } }, error: null });
    }
  };

  const repo = new ReviewRepository(() => fakeClient);
  const result = await repo.deleteAndRecalculate('review-1');

  assert.equal(result.review._id, 'review-1');
  assert.deepEqual(calls[0], ['rpc', 'delete_review_and_recalculate_ratings', {
    p_review_id: 'review-1'
  }]);
});
