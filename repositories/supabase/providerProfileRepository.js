const { BaseRepository, ensureNoError } = require('./baseRepository');
const { mapProviderProfileRow } = require('./mappers');

const PROFILE_SELECT = [
  'id',
  'user_id',
  'provider_type',
  'display_name',
  'business_name',
  'contact_person_name',
  'description',
  'phone',
  'email',
  'address',
  'location',
  'operating_locations',
  'verification_status',
  'rejection_reason',
  'rating',
  'is_active',
  'created_at',
  'updated_at'
].join(',');

class ProviderProfileRepository extends BaseRepository {
  constructor(clientFactory) {
    super('provider_profiles', mapProviderProfileRow, clientFactory);
  }

  async findByUserId(userId) {
    const result = await this.table()
      .select(PROFILE_SELECT)
      .eq('user_id', userId)
      .maybeSingle();
    return mapProviderProfileRow(ensureNoError(result, 'Find provider profile by user id'));
  }

  async create(payload) {
    const {
      userId, providerType = 'individual', displayName, businessName,
      contactPersonName, description, phone, email, address, location,
      operatingLocations
    } = payload;

    const result = await this.table()
      .insert({
        user_id: userId,
        provider_type: providerType,
        display_name: displayName,
        business_name: businessName || null,
        contact_person_name: contactPersonName || null,
        description: description || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        location: location || {},
        operating_locations: operatingLocations || []
      })
      .select(PROFILE_SELECT)
      .single();

    return mapProviderProfileRow(ensureNoError(result, 'Create provider profile'));
  }

  async updateByUserId(userId, updates) {
    const allowed = [
      'display_name', 'business_name', 'contact_person_name', 'description',
      'phone', 'email', 'address', 'location', 'operating_locations', 'is_active'
    ];

    const payload = {};
    if (updates.displayName !== undefined) payload.display_name = updates.displayName;
    if (updates.businessName !== undefined) payload.business_name = updates.businessName;
    if (updates.contactPersonName !== undefined) payload.contact_person_name = updates.contactPersonName;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.email !== undefined) payload.email = updates.email;
    if (updates.address !== undefined) payload.address = updates.address;
    if (updates.location !== undefined) payload.location = updates.location;
    if (updates.operatingLocations !== undefined) payload.operating_locations = updates.operatingLocations;
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;

    if (Object.keys(payload).length === 0) {
      return this.findByUserId(userId);
    }

    const result = await this.table()
      .update(payload)
      .eq('user_id', userId)
      .select(PROFILE_SELECT)
      .single();

    return mapProviderProfileRow(ensureNoError(result, 'Update provider profile'));
  }

  async listCompanyProviders({ page = 1, limit = 20, verificationStatus } = {}) {
    let query = this.table()
      .select(PROFILE_SELECT, { count: 'exact' })
      .eq('provider_type', 'company');

    if (verificationStatus) {
      query = query.eq('verification_status', verificationStatus);
    }

    const from = (Number(page) - 1) * Number(limit);
    const to = from + Number(limit) - 1;
    const result = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    const data = ensureNoError(result, 'List company providers') || [];

    return {
      data: data.map(mapProviderProfileRow),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: result.count || 0,
        pages: Math.ceil((result.count || 0) / Number(limit))
      }
    };
  }

  async approveById(id) {
    const result = await this.table()
      .update({ verification_status: 'approved', rejection_reason: null })
      .eq('id', id)
      .select(PROFILE_SELECT)
      .single();

    return mapProviderProfileRow(ensureNoError(result, 'Approve provider profile'));
  }

  async rejectById(id, reason) {
    const result = await this.table()
      .update({ verification_status: 'rejected', rejection_reason: reason || null })
      .eq('id', id)
      .select(PROFILE_SELECT)
      .single();

    return mapProviderProfileRow(ensureNoError(result, 'Reject provider profile'));
  }
}

module.exports = {
  ProviderProfileRepository,
  providerProfileRepository: new ProviderProfileRepository()
};
