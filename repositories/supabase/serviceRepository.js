const { BaseRepository, ensureNoError } = require('./baseRepository');
const { mapServiceRow } = require('./mappers');

const SERVICE_SELECT = '*,provider:provider_id(id,name,email,phone,role,profile,provider_details,rating_average,rating_count,completed_jobs_count,wallet_balance,wallet_currency,is_active,created_at,updated_at)';

const toNumberOrUndefined = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const escapeLike = (value) => String(value).replace(/[%_]/g, '\\$&');

class ServiceRepository extends BaseRepository {
  constructor(clientFactory) {
    super('services', mapServiceRow, clientFactory);
  }

  async createService({ providerId, name, category, description, price, priceType, duration, images, location, servicesOffered }) {
    const result = await this.table()
      .insert({
        provider_id: providerId,
        name,
        category,
        description,
        price,
        price_type: priceType || 'hourly',
        duration_minutes: duration,
        images: images || [],
        location: location || {},
        services_offered: servicesOffered || []
      })
      .select(SERVICE_SELECT)
      .single();

    return mapServiceRow(ensureNoError(result, 'Create service'));
  }

  applyFilters(query, { category, search, minPrice, maxPrice, minRating, providerId, includeInactive = false } = {}) {
    let nextQuery = query;

    if (!includeInactive) {
      nextQuery = nextQuery.eq('is_active', true);
    }

    if (category) {
      nextQuery = nextQuery.ilike('category', `%${escapeLike(category)}%`);
    }

    if (providerId) {
      nextQuery = nextQuery.eq('provider_id', providerId);
    }

    const parsedMinPrice = toNumberOrUndefined(minPrice);
    const parsedMaxPrice = toNumberOrUndefined(maxPrice);
    const parsedMinRating = toNumberOrUndefined(minRating);

    if (parsedMinPrice !== undefined) {
      nextQuery = nextQuery.gte('price', parsedMinPrice);
    }
    if (parsedMaxPrice !== undefined) {
      nextQuery = nextQuery.lte('price', parsedMaxPrice);
    }
    if (parsedMinRating !== undefined) {
      nextQuery = nextQuery.gte('rating_average', parsedMinRating);
    }

    if (search) {
      const escaped = escapeLike(search);
      nextQuery = nextQuery.or(`name.ilike.%${escaped}%,description.ilike.%${escaped}%,category.ilike.%${escaped}%`);
    }

    return nextQuery;
  }

  async listServices({ page = 1, limit = 10, category, search, minPrice, maxPrice, minRating, providerId } = {}) {
    let query = this.table().select(SERVICE_SELECT, { count: 'exact' });
    query = this.applyFilters(query, { category, search, minPrice, maxPrice, minRating, providerId });

    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 10;
    const from = (numericPage - 1) * numericLimit;
    const to = from + numericLimit - 1;
    const result = await query.order('created_at', { ascending: false }).range(from, to);
    const data = ensureNoError(result, 'List services') || [];

    return {
      data: data.map(mapServiceRow),
      pagination: {
        page: numericPage,
        limit: numericLimit,
        total: result.count || 0,
        pages: Math.ceil((result.count || 0) / numericLimit)
      }
    };
  }

  async searchServices(filters = {}) {
    let query = this.table().select(SERVICE_SELECT);
    query = this.applyFilters(query, filters);
    const result = await query.order('created_at', { ascending: false });
    return (ensureNoError(result, 'Search services') || []).map(mapServiceRow);
  }

  async findById(id) {
    const result = await this.table()
      .select(SERVICE_SELECT)
      .eq('id', id)
      .maybeSingle();

    return mapServiceRow(ensureNoError(result, 'Find service by id'));
  }

  async updateService(id, updates, user) {
    let query = this.table().update(updates).eq('id', id);
    if (user?.role !== 'admin') {
      query = query.eq('provider_id', user?._id || user?.id);
    }

    const result = await query.select(SERVICE_SELECT).maybeSingle();
    return mapServiceRow(ensureNoError(result, 'Update service'));
  }

  async deleteService(id, user) {
    let query = this.table().delete().eq('id', id);
    if (user?.role !== 'admin') {
      query = query.eq('provider_id', user?._id || user?.id);
    }

    const result = await query.select(SERVICE_SELECT).maybeSingle();
    return mapServiceRow(ensureNoError(result, 'Delete service'));
  }
}

module.exports = {
  SERVICE_SELECT,
  ServiceRepository,
  serviceRepository: new ServiceRepository()
};
