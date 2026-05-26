const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mapUserRow,
  mapServiceRow,
  mapBookingRow,
  mapWalletTransactionRow,
  mapMessageRow
} = require('../repositories/supabase/mappers');

test('mapUserRow preserves the current user API shape', () => {
  const user = mapUserRow({
    id: 'user-1',
    auth_user_id: 'auth-1',
    name: 'Ada Customer',
    email: 'ada@example.com',
    phone: '+2348012345678',
    role: 'customer',
    profile: { bio: 'Hello' },
    provider_details: { category: 'cleaning' },
    rating_average: 4.5,
    rating_count: 8,
    completed_jobs_count: 3,
    wallet_balance: 1200,
    wallet_currency: 'NGN',
    is_active: true,
    fcm_token: 'fcm-token',
    created_at: '2026-05-20T10:00:00.000Z',
    updated_at: '2026-05-20T11:00:00.000Z'
  });

  assert.equal(user._id, 'user-1');
  assert.equal(user.id, 'user-1');
  assert.equal(user.email, 'ada@example.com');
  assert.equal(user.rating.average, 4.5);
  assert.equal(user.rating.count, 8);
  assert.equal(user.wallet.balance, 1200);
  assert.equal(user.wallet.currency, 'NGN');
  assert.equal(user.isActive, true);
  assert.equal(user.password, undefined);
  assert.deepEqual(user.providerDetails, { category: 'cleaning' });
});

test('mapServiceRow maps service fields and nested provider rows', () => {
  const service = mapServiceRow({
    id: 'service-1',
    provider_id: 'provider-1',
    provider: {
      id: 'provider-1',
      name: 'Provider One',
      profile: { avatar: 'avatar.png' },
      rating_average: 5,
      rating_count: 2
    },
    name: 'House Cleaning',
    category: 'Cleaning',
    description: 'Deep clean',
    price: 5000,
    price_type: 'fixed',
    duration_minutes: 120,
    images: ['a.png'],
    location: { address: 'Lagos' },
    rating_average: 4,
    rating_count: 10,
    services_offered: ['Dusting'],
    gallery: ['b.png'],
    is_active: true
  });

  assert.equal(service._id, 'service-1');
  assert.equal(service.provider._id, 'provider-1');
  assert.equal(service.priceType, 'fixed');
  assert.equal(service.duration, 120);
  assert.deepEqual(service.servicesOffered, ['Dusting']);
  assert.equal(service.rating.average, 4);
});

test('mapBookingRow maps booking ownership and payment fields', () => {
  const booking = mapBookingRow({
    id: 'booking-1',
    customer_id: 'customer-1',
    provider_id: 'provider-1',
    service_id: 'service-1',
    date: '2026-05-21',
    start_time: '09:00',
    duration_minutes: 60,
    status: 'pending',
    total_amount: 10000,
    currency: 'NGN',
    payment_status: 'pending',
    notes: 'Bring tools',
    address: { city: 'Ikeja' },
    service_images: ['done.png'],
    reminder_sent: false
  });

  assert.equal(booking._id, 'booking-1');
  assert.equal(booking.customer, 'customer-1');
  assert.equal(booking.provider, 'provider-1');
  assert.equal(booking.service, 'service-1');
  assert.equal(booking.time, '09:00');
  assert.equal(booking.duration, 60);
  assert.equal(booking.totalAmount, 10000);
  assert.equal(booking.paymentStatus, 'pending');
  assert.deepEqual(booking.serviceImages, ['done.png']);
});

test('mapWalletTransactionRow and mapMessageRow preserve API names', () => {
  const tx = mapWalletTransactionRow({
    id: 'tx-1',
    user_id: 'user-1',
    type: 'credit',
    amount: 700,
    currency: 'NGN',
    description: 'Top-up',
    reference: 'DEP_1',
    status: 'completed',
    metadata: { paymentMethod: 'paystack' }
  });

  assert.equal(tx._id, 'tx-1');
  assert.equal(tx.user, 'user-1');
  assert.equal(tx.metadata.paymentMethod, 'paystack');

  const message = mapMessageRow({
    id: 'msg-1',
    conversation_id: 'conversation-1',
    sender_id: 'user-1',
    recipient_id: 'user-2',
    content: 'Hello',
    content_type: 'text',
    read: false,
    delivered: true,
    status: 'sent',
    attachments: []
  });

  assert.equal(message._id, 'msg-1');
  assert.equal(message.conversation, 'conversation-1');
  assert.equal(message.sender, 'user-1');
  assert.equal(message.recipient, 'user-2');
  assert.equal(message.contentType, 'text');
});
