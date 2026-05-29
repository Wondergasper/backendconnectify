const { BaseRepository, ensureNoError } = require('./baseRepository');
const { mapProviderServiceRow } = require('./mappers');

const SERVICE_SELECT = [
  'id',
  'provider_id',
  'service_name',
  'category',
  'description',
  'starting_price',
  'price_type',
  'is_available',
  'created_at',
  'updated_at'
].join(',');

class ProviderServiceRepository extends BaseRepository {
  constructor(clientFactory) {
    super('provider_services', mapProviderServiceRow, clientFactory);
  }

  async create(payload) {
    const {
      providerId, serviceName, category, description,
      startingPrice, priceType, isAvailable = true
    } = payload;

    const result = await this.table()
      .insert({
        provider_id: providerId,
        service_name: serviceName,
        category,
        description: description || null,
        starting_price: startingPrice !== undefined ? startingPrice : null,
        price_type: priceType || 'fixed',
        is_available: isAvailable
      })
      .select(SERVICE_SELECT)
      .single();

    return mapProviderServiceRow(ensureNoError(result, 'Create provider service'));
  }

  async listByProviderId(providerId, { page = 1, limit = 20 } = {}) {
    const from = (Number(page) - 1) * Number(limit);
    const to = from + Number(limit) - 1;

    const result = await this.table()
      .select(SERVICE_SELECT, { count: 'exact' })
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
      .range(from, to);

    const data = ensureNoError(result, 'List provider services') || [];

    return {
      data: data.map(mapProviderServiceRow),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: result.count || 0,
        pages: Math.ceil((result.count || 0) / Number(limit))
      }
    };
  }

  async findByIdAndProviderId(id, providerId) {
    const result = await this.table()
      .select(SERVICE_SELECT)
      .eq('id', id)
      .eq('provider_id', providerId)
      .maybeSingle();

    return mapProviderServiceRow(ensureNoError(result, 'Find provider service by id'));
  }

  async updateByIdAndProviderId(id, providerId, updates) {
    const payload = {};
    if (updates.serviceName !== undefined) payload.service_name = updates.serviceName;
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.startingPrice !== undefined) payload.starting_price = updates.startingPrice;
    if (updates.priceType !== undefined) payload.price_type = updates.priceType;
    if (updates.isAvailable !== undefined) payload.is_available = updates.isAvailable;

    const result = await this.table()
      .update(payload)
      .eq('id', id)
      .eq('provider_id', providerId)
      .select(SERVICE_SELECT)
      .single();

    return mapProviderServiceRow(ensureNoError(result, 'Update provider service'));
  }

  async deleteByIdAndProviderId(id, providerId) {
    const result = await this.table()
      .delete()
      .eq('id', id)
      .eq('provider_id', providerId)
      .select(SERVICE_SELECT)
      .maybeSingle();

    return mapProviderServiceRow(ensureNoError(result, 'Delete provider service'));
  }
}

module.exports = {
  ProviderServiceRepository,
  providerServiceRepository: new ProviderServiceRepository()
};
