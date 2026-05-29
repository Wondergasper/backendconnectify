const test = require('node:test');
const assert = require('node:assert/strict');

const { ProviderProfileRepository } = require('../repositories/supabase/providerProfileRepository');
const { ProviderServiceRepository } = require('../repositories/supabase/providerServiceRepository');
const { TeamMemberRepository } = require('../repositories/supabase/teamMemberRepository');
const { ServiceRequestRepository } = require('../repositories/supabase/serviceRequestRepository');
const { JobQuoteRepository } = require('../repositories/supabase/jobQuoteRepository');

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
      data = { ...payload, id: 'test-id', created_at: 'now', updated_at: 'now' };
      return query;
    },
    update: (payload) => {
      calls.push(['update', payload]);
      if (Array.isArray(data)) {
        data = data.map(item => ({ ...item, ...payload }));
      } else {
        data = { ...data, ...payload };
      }
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

// -------------------------------------------------------------
// ProviderProfileRepository Tests
// -------------------------------------------------------------

test('ProviderProfileRepository create inserts and maps payload correctly', async () => {
  const calls = [];
  const fakeClient = {
    from: (table) => {
      calls.push(['from', table]);
      return makeQuery({}, calls);
    }
  };

  const repo = new ProviderProfileRepository(() => fakeClient);
  const profile = await repo.create({
    userId: 'user-123',
    providerType: 'company',
    displayName: 'Super Corp',
    businessName: 'Super Corp Ltd',
    contactPersonName: 'Alice Smith',
    phone: '+2349000000',
    email: 'info@supercorp.com',
    operatingLocations: ['Lagos', 'Abuja']
  });

  assert.equal(profile.userId, 'user-123');
  assert.equal(profile.providerType, 'company');
  assert.equal(profile.displayName, 'Super Corp');
  assert.equal(profile.businessName, 'Super Corp Ltd');
  assert.equal(profile.contactPersonName, 'Alice Smith');
  assert.deepEqual(profile.operatingLocations, ['Lagos', 'Abuja']);
  assert.equal(profile.verificationStatus, 'pending');

  assert.ok(calls.some(c => c[0] === 'from' && c[1] === 'provider_profiles'));
  assert.ok(calls.some(c => c[0] === 'insert' && c[1].user_id === 'user-123'));
});

test('ProviderProfileRepository findByUserId fetches correct user_id', async () => {
  const calls = [];
  const fakeClient = {
    from: (table) => {
      calls.push(['from', table]);
      return makeQuery({
        id: 'prof-123',
        user_id: 'user-123',
        provider_type: 'individual',
        display_name: 'Bob J'
      }, calls);
    }
  };

  const repo = new ProviderProfileRepository(() => fakeClient);
  const profile = await repo.findByUserId('user-123');

  assert.equal(profile.id, 'prof-123');
  assert.equal(profile.userId, 'user-123');
  assert.equal(profile.displayName, 'Bob J');
  assert.equal(profile.providerType, 'individual');

  assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'user_id' && c[2] === 'user-123'));
});

test('ProviderProfileRepository updateByUserId applies specified changes', async () => {
  const calls = [];
  const fakeClient = {
    from: (table) => {
      calls.push(['from', table]);
      return makeQuery({
        id: 'prof-123',
        user_id: 'user-123',
        provider_type: 'company',
        display_name: 'Initial Name'
      }, calls);
    }
  };

  const repo = new ProviderProfileRepository(() => fakeClient);
  const profile = await repo.updateByUserId('user-123', {
    displayName: 'Updated Name',
    businessName: 'Corp Business'
  });

  assert.equal(profile.displayName, 'Updated Name');
  assert.equal(profile.businessName, 'Corp Business');

  const updateCall = calls.find(c => c[0] === 'update');
  assert.ok(updateCall);
  assert.deepEqual(updateCall[1], {
    display_name: 'Updated Name',
    business_name: 'Corp Business'
  });
});

test('ProviderProfileRepository listCompanyProviders filters and returns list', async () => {
  const calls = [];
  const fakeClient = {
    from: (table) => {
      calls.push(['from', table]);
      return makeQuery([
        { id: '1', provider_type: 'company', display_name: 'C1' },
        { id: '2', provider_type: 'company', display_name: 'C2' }
      ], calls, 2);
    }
  };

  const repo = new ProviderProfileRepository(() => fakeClient);
  const result = await repo.listCompanyProviders({
    page: 1,
    limit: 10,
    verificationStatus: 'approved'
  });

  assert.equal(result.data.length, 2);
  assert.equal(result.pagination.total, 2);
  assert.equal(result.data[0].displayName, 'C1');

  assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'provider_type' && c[2] === 'company'));
  assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'verification_status' && c[2] === 'approved'));
});

test('ProviderProfileRepository approve and reject updates status correctly', async () => {
  const calls = [];
  const fakeClient = {
    from: (table) => {
      calls.push(['from', table]);
      return makeQuery({ id: 'prof-123', verification_status: 'pending' }, calls);
    }
  };

  const repo = new ProviderProfileRepository(() => fakeClient);

  // Approve
  const approved = await repo.approveById('prof-123');
  assert.equal(approved.verificationStatus, 'approved');
  assert.equal(approved.rejectionReason, null);

  // Reject
  const rejected = await repo.rejectById('prof-123', 'Incomplete documents');
  assert.equal(rejected.verificationStatus, 'rejected');
  assert.equal(rejected.rejectionReason, 'Incomplete documents');
});

// -------------------------------------------------------------
// ProviderServiceRepository Tests
// -------------------------------------------------------------

test('ProviderServiceRepository performs CRUD operations correctly', async () => {
  const calls = [];
  const fakeClient = {
    from: (table) => {
      calls.push(['from', table]);
      return makeQuery({
        id: 'srv-123',
        provider_id: 'prov-123',
        service_name: 'Cleaning',
        category: 'home'
      }, calls);
    }
  };

  const repo = new ProviderServiceRepository(() => fakeClient);

  // Create
  const service = await repo.create({
    providerId: 'prov-123',
    serviceName: 'Cleaning',
    category: 'home',
    startingPrice: 5000,
    priceType: 'fixed'
  });
  assert.equal(service.serviceName, 'Cleaning');
  assert.equal(service.startingPrice, 5000);

  // Find
  const found = await repo.findByIdAndProviderId('srv-123', 'prov-123');
  assert.equal(found.id, 'srv-123');

  // Update
  const updated = await repo.updateByIdAndProviderId('srv-123', 'prov-123', {
    serviceName: 'Deep Cleaning'
  });
  assert.equal(updated.serviceName, 'Deep Cleaning');

  // Delete
  const deleted = await repo.deleteByIdAndProviderId('srv-123', 'prov-123');
  assert.ok(deleted);
});

// -------------------------------------------------------------
// TeamMemberRepository Tests
// -------------------------------------------------------------

test('TeamMemberRepository performs CRUD operations correctly', async () => {
  const calls = [];
  const fakeClient = {
    from: (table) => {
      calls.push(['from', table]);
      return makeQuery({
        id: 'tm-123',
        provider_id: 'prov-123',
        full_name: 'John Doe',
        role: 'Technician'
      }, calls);
    }
  };

  const repo = new TeamMemberRepository(() => fakeClient);

  // Create
  const member = await repo.create({
    providerId: 'prov-123',
    fullName: 'John Doe',
    role: 'Technician',
    phone: '+2348000000'
  });
  assert.equal(member.fullName, 'John Doe');
  assert.equal(member.role, 'Technician');

  // Find
  const found = await repo.findByIdAndProviderId('tm-123', 'prov-123');
  assert.equal(found.fullName, 'John Doe');

  // Update
  const updated = await repo.updateByIdAndProviderId('tm-123', 'prov-123', {
    fullName: 'Johnny Doe'
  });
  assert.equal(updated.fullName, 'Johnny Doe');

  // Delete
  const deleted = await repo.deleteByIdAndProviderId('tm-123', 'prov-123');
  assert.ok(deleted);
});

// -------------------------------------------------------------
// ServiceRequestRepository Tests
// -------------------------------------------------------------

test('ServiceRequestRepository performs CRUD and status actions correctly', async () => {
  const calls = [];
  const fakeClient = {
    from: (table) => {
      calls.push(['from', table]);
      return makeQuery({
        id: 'req-123',
        customer_id: 'cust-123',
        customer_type: 'company',
        service_category: 'IT',
        description: 'Need network setup',
        status: 'pending'
      }, calls);
    }
  };

  const repo = new ServiceRequestRepository(() => fakeClient);

  // Create
  const request = await repo.create({
    customerId: 'cust-123',
    customerType: 'company',
    serviceCategory: 'IT',
    description: 'Need network setup',
    budget: 500000
  });
  assert.equal(request.description, 'Need network setup');
  assert.equal(request.budget, 500000);

  // Find
  const found = await repo.findById('req-123');
  assert.equal(found.id, 'req-123');

  // Update Status
  const accepted = await repo.updateStatus('req-123', 'accepted');
  assert.equal(accepted.status, 'accepted');

  // Assign Provider
  const assignedProv = await repo.assignProvider('req-123', 'prov-123');
  assert.equal(assignedProv.assignedProviderId, 'prov-123');
  assert.equal(assignedProv.status, 'assigned');

  // Assign Team Member
  const assignedTeam = await repo.assignTeamMember('req-123', 'tm-123');
  assert.equal(assignedTeam.assignedTeamMemberId, 'tm-123');
});

// -------------------------------------------------------------
// JobQuoteRepository Tests
// -------------------------------------------------------------

test('JobQuoteRepository performs CRUD and status actions correctly', async () => {
  const calls = [];
  const fakeClient = {
    from: (table) => {
      calls.push(['from', table]);
      return makeQuery({
        id: 'quote-123',
        request_id: 'req-123',
        provider_id: 'prov-123',
        quoted_amount: 45000,
        status: 'pending'
      }, calls);
    }
  };

  const repo = new JobQuoteRepository(() => fakeClient);

  // Create
  const quote = await repo.create({
    requestId: 'req-123',
    providerId: 'prov-123',
    quotedAmount: 45000,
    message: 'We can complete this quickly'
  });
  assert.equal(quote.quotedAmount, 45000);

  // Find
  const found = await repo.findById('quote-123');
  assert.equal(found.id, 'quote-123');

  // Find by Request & Provider
  const foundSpec = await repo.findByRequestAndProvider('req-123', 'prov-123');
  assert.equal(foundSpec.quotedAmount, 45000);

  // Update status
  const acceptedQuote = await repo.updateStatus('quote-123', 'accepted');
  assert.equal(acceptedQuote.status, 'accepted');
});
