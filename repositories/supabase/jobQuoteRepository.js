const { BaseRepository, ensureNoError } = require('./baseRepository');
const { mapJobQuoteRow } = require('./mappers');

const QUOTE_SELECT = [
  'id',
  'request_id',
  'provider_id',
  'quoted_amount',
  'estimated_delivery_time',
  'message',
  'status',
  'created_at',
  'updated_at'
].join(',');

class JobQuoteRepository extends BaseRepository {
  constructor(clientFactory) {
    super('job_quotes', mapJobQuoteRow, clientFactory);
  }

  async create(payload) {
    const {
      requestId, providerId, quotedAmount,
      estimatedDeliveryTime, message
    } = payload;

    const result = await this.table()
      .insert({
        request_id: requestId,
        provider_id: providerId,
        quoted_amount: quotedAmount,
        estimated_delivery_time: estimatedDeliveryTime || null,
        message: message || null
      })
      .select(QUOTE_SELECT)
      .single();

    return mapJobQuoteRow(ensureNoError(result, 'Create job quote'));
  }

  async findById(id) {
    const result = await this.table()
      .select(QUOTE_SELECT)
      .eq('id', id)
      .maybeSingle();

    return mapJobQuoteRow(ensureNoError(result, 'Find job quote by id'));
  }

  async findByRequestAndProvider(requestId, providerId) {
    const result = await this.table()
      .select(QUOTE_SELECT)
      .eq('request_id', requestId)
      .eq('provider_id', providerId)
      .maybeSingle();

    return mapJobQuoteRow(ensureNoError(result, 'Find job quote by request and provider'));
  }

  async listByRequestId(requestId) {
    const result = await this.table()
      .select(QUOTE_SELECT)
      .eq('request_id', requestId)
      .order('created_at', { ascending: false });

    const data = ensureNoError(result, 'List quotes by request') || [];
    return data.map(mapJobQuoteRow);
  }

  async listForProvider(providerId, { page = 1, limit = 20, status } = {}) {
    const from = (Number(page) - 1) * Number(limit);
    const to = from + Number(limit) - 1;

    let query = this.table()
      .select(QUOTE_SELECT, { count: 'exact' })
      .eq('provider_id', providerId);

    if (status) {
      query = query.eq('status', status);
    }

    const result = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    const data = ensureNoError(result, 'List quotes for provider') || [];

    return {
      data: data.map(mapJobQuoteRow),
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
      .select(QUOTE_SELECT)
      .single();

    return mapJobQuoteRow(ensureNoError(result, 'Update job quote status'));
  }
}

module.exports = {
  JobQuoteRepository,
  jobQuoteRepository: new JobQuoteRepository()
};
