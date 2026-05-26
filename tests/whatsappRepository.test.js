const test = require('node:test');
const assert = require('node:assert/strict');

// Mock getSupabaseClient before requiring repository
const makeResultQuery = (data, error = null, count = null) => {
  const query = {
    select: () => query,
    eq: () => query,
    neq: () => query,
    single: () => Promise.resolve({ data, error }),
    maybeSingle: () => Promise.resolve({ data, error }),
    insert: () => query,
    update: () => query,
    or: () => query,
    limit: () => query,
    then: (resolve) => resolve({ data, error, count })
  };
  return query;
};

// Temporarily override or mock the client factory in the repository
const connectifyRepository = require('../modules/whatsapp/services/connectifyRepository');

test('WhatsApp repository findUserByPhone maps app_users and returns user', async () => {
  const fakeUser = {
    id: 'user-whatsapp-123',
    name: 'WhatsApp User',
    phone: '+2348011112222',
    role: 'customer'
  };

  const fakeClient = {
    from: (table) => {
      assert.equal(table, 'app_users');
      return makeResultQuery(fakeUser);
    }
  };

  // Temporarily replace client getter
  Object.defineProperty(connectifyRepository, 'client', {
    get: () => fakeClient,
    configurable: true
  });

  const user = await connectifyRepository.findUserByPhone('+2348011112222');
  assert.equal(user.id, 'user-whatsapp-123');
  assert.equal(user.phone, '+2348011112222');
});

test('WhatsApp repository findOrCreateWhatsAppUser inserts placeholder and profile JSONB', async () => {
  const fakeUser = {
    id: 'user-whatsapp-123',
    name: 'WhatsApp User',
    phone: '+2348011112222',
    role: 'customer',
    profile: { whatsapp_id: '+2348011112222' }
  };

  let insertedPayload = null;
  const fakeClient = {
    from: (table) => {
      assert.equal(table, 'app_users');
      return {
        select: () => {
          return {
            or: () => {
              // Return null for findUserByPhone to trigger insert
              return {
                maybeSingle: () => Promise.resolve({ data: null, error: null })
              };
            },
            single: () => Promise.resolve({ data: fakeUser, error: null })
          };
        },
        insert: (payload) => {
          insertedPayload = payload;
          return {
            select: () => {
              return {
                single: () => Promise.resolve({ data: fakeUser, error: null })
              };
            }
          };
        }
      };
    }
  };

  Object.defineProperty(connectifyRepository, 'client', {
    get: () => fakeClient,
    configurable: true
  });

  const user = await connectifyRepository.findOrCreateWhatsAppUser('+2348011112222');
  assert.equal(user.id, 'user-whatsapp-123');
  assert.equal(insertedPayload.name, 'WhatsApp User');
  assert.equal(insertedPayload.email, 'whatsapp_2348011112222@connectify.com');
  assert.equal(insertedPayload.profile.whatsapp_id, '+2348011112222');
});

test('WhatsApp repository updateUserName updates name and profile completed status', async () => {
  const existingUser = {
    id: 'user-whatsapp-123',
    name: 'WhatsApp User',
    phone: '+2348011112222',
    profile: { whatsapp_id: '+2348011112222' }
  };

  const updatedUser = {
    id: 'user-whatsapp-123',
    name: 'Jane Doe',
    phone: '+2348011112222',
    profile: { whatsapp_id: '+2348011112222', fullName: 'Jane Doe', profileCompleted: true }
  };

  let updatedPayload = null;
  const fakeClient = {
    from: (table) => {
      assert.equal(table, 'app_users');
      return {
        select: () => {
          return {
            eq: () => {
              return {
                single: () => Promise.resolve({ data: existingUser, error: null })
              };
            }
          };
        },
        update: (payload) => {
          updatedPayload = payload;
          return {
            eq: () => {
              return {
                select: () => {
                  return {
                    single: () => Promise.resolve({ data: updatedUser, error: null })
                  };
                }
              };
            }
          };
        }
      };
    }
  };

  Object.defineProperty(connectifyRepository, 'client', {
    get: () => fakeClient,
    configurable: true
  });

  const user = await connectifyRepository.updateUserName('user-whatsapp-123', 'Jane Doe');
  assert.equal(user.name, 'Jane Doe');
  assert.equal(updatedPayload.name, 'Jane Doe');
  assert.equal(updatedPayload.profile.profileCompleted, true);
  assert.equal(updatedPayload.profile.fullName, 'Jane Doe');
});

test('WhatsApp repository findMatchingServices searches services with JSONB and provider joins', async () => {
  const fakeServices = [
    {
      id: 'service-1',
      provider_id: 'provider-1',
      category: 'Cleaning',
      price: 5000,
      location: { address: '123 Main St', city: 'Lagos' },
      provider: {
        id: 'provider-1',
        name: 'John Cleaner'
      }
    }
  ];

  const fakeClient = {
    from: (table) => {
      assert.equal(table, 'services');
      return makeResultQuery(fakeServices);
    }
  };

  Object.defineProperty(connectifyRepository, 'client', {
    get: () => fakeClient,
    configurable: true
  });

  const services = await connectifyRepository.findMatchingServices({ service: 'clean', location: 'Lagos' });
  assert.equal(services.length, 1);
  assert.equal(services[0].displayName, 'John Cleaner');
  assert.equal(services[0].priceLabel, 'NGN 5,000');
  assert.equal(services[0].locationLabel, '123 Main St');
});

test('WhatsApp repository createBookingRequest inserts booking', async () => {
  const fakeBooking = {
    id: 'booking-123',
    customer_id: 'customer-1',
    provider_id: 'provider-1',
    service_id: 'service-1'
  };

  let insertedPayload = null;
  const fakeClient = {
    from: (table) => {
      assert.equal(table, 'bookings');
      return {
        insert: (payload) => {
          insertedPayload = payload;
          return {
            select: () => {
              return {
                single: () => Promise.resolve({ data: fakeBooking, error: null })
              };
            }
          };
        }
      };
    }
  };

  Object.defineProperty(connectifyRepository, 'client', {
    get: () => fakeClient,
    configurable: true
  });

  const session = {
    date: '2026-05-25',
    time: '14:00',
    duration: 120,
    service: 'Plumbing',
    location: 'Lagos'
  };

  const provider = {
    id: 'service-1',
    providerId: 'provider-1',
    price: 8000
  };

  const booking = await connectifyRepository.createBookingRequest({
    customerId: 'customer-1',
    provider,
    session
  });

  assert.equal(booking.id, 'booking-123');
  assert.equal(insertedPayload.customer_id, 'customer-1');
  assert.equal(insertedPayload.provider_id, 'provider-1');
  assert.equal(insertedPayload.service_id, 'service-1');
  assert.equal(insertedPayload.date, '2026-05-25');
  assert.equal(insertedPayload.start_time, '14:00');
  assert.equal(insertedPayload.duration_minutes, 120);
  assert.equal(insertedPayload.total_amount, 8000);
});
