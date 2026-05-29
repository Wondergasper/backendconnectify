const { BaseRepository, ensureNoError } = require('./baseRepository');
const { mapServiceRequestRow } = require('./mappers');

const REQUEST_SELECT = [
  'id',
  'customer_id',
  'customer_type',
  'service_category',
  'description',
  'location',
  'budget',
  'urgency',
  'preferred_date',
  'status',
  'assigned_provider_id',
  'assigned_team_member_id',
  'created_at',
  'updated_at'
].join(',');

class ServiceRequestRepository extends BaseRepository {
  constructor(clientFactory) {
    super('service_requests', mapServiceRequestRow, clientFactory);
  }

  async create(payload) {
    const {
      customerId, customerType = 'individual', serviceCategory, description,
      location, budget, urgency = 'normal', preferredDate
    } = payload;

    const result = await this.table()
      .insert({
        customer_id: customerId,
        customer_type: customerType,
        service_category: serviceCategory,
        description,
        location: location || {},
        budget: budget !== undefined ? budget : null,
        urgency,
        preferred_date: preferredDate || null
      })
      .select(REQUEST_SELECT)
      .single();

    return mapServiceRequestRow(ensureNoError(result, 'Create service request'));
  }

  async findById(id) {
    const result = await this.table()
      .select(REQUEST_SELECT)
      .eq('id', id)
      .maybeSingle();

    return mapServiceRequestRow(ensureNoError(result, 'Find service request by id'));
  }

  /**
   * List requests visible to a provider:
   *  - Requests assigned to them, OR
   *  - Pending / matched requests (open marketplace)
   */
  async listForProvider(providerId, { page = 1, limit = 20, status } = {}) {
    const from = (Number(page) - 1) * Number(limit);
    const to = from + Number(limit) - 1;

    let query = this.table()
      .select(REQUEST_SELECT, { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    } else {
      // Providers see their assigned jobs + open requests
      query = query.or(
        `assigned_provider_id.eq.${providerId},status.in.(pending,matched)`
      );
    }

    const result = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    const data = ensureNoError(result, 'List service requests for provider') || [];

    return {
      data: data.map(mapServiceRequestRow),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: result.count || 0,
        pages: Math.ceil((result.count || 0) / Number(limit))
      }
    };
  }

  async updateStatus(id, status) {
    const result = await this.table()
      .update({ status })
      .eq('id', id)
      .select(REQUEST_SELECT)
      .single();

    return mapServiceRequestRow(ensureNoError(result, 'Update service request status'));
  }

  async assignProvider(id, providerId) {
    const result = await this.table()
      .update({ assigned_provider_id: providerId, status: 'assigned' })
      .eq('id', id)
      .select(REQUEST_SELECT)
      .single();

    return mapServiceRequestRow(ensureNoError(result, 'Assign provider to service request'));
  }

  async assignTeamMember(id, teamMemberId) {
    const result = await this.table()
      .update({ assigned_team_member_id: teamMemberId, status: 'assigned' })
      .eq('id', id)
      .select(REQUEST_SELECT)
      .single();

    return mapServiceRequestRow(ensureNoError(result, 'Assign team member to service request'));
  }
}

module.exports = {
  ServiceRequestRepository,
  serviceRequestRepository: new ServiceRequestRepository()
};
