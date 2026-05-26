const { getSupabaseServiceClient } = require('../../services/supabaseClient');

class RepositoryError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'RepositoryError';
    this.cause = cause;
  }
}

const ensureNoError = (result, context) => {
  if (result.error) {
    throw new RepositoryError(`${context}: ${result.error.message}`, result.error);
  }
  return result.data;
};

class BaseRepository {
  constructor(tableName, mapper = (row) => row, clientFactory = getSupabaseServiceClient) {
    this.tableName = tableName;
    this.mapper = mapper;
    this.clientFactory = clientFactory;
  }

  get client() {
    return this.clientFactory();
  }

  table() {
    return this.client.from(this.tableName);
  }

  async findById(id, select = '*') {
    const result = await this.table().select(select).eq('id', id).maybeSingle();
    return this.mapper(ensureNoError(result, `Find ${this.tableName} by id`));
  }

  async list({ select = '*', filters = {}, page = 1, limit = 20, orderBy = 'created_at', ascending = false } = {}) {
    let query = this.table().select(select, { count: 'exact' });

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query = query.eq(key, value);
      }
    });

    const from = (Number(page) - 1) * Number(limit);
    const to = from + Number(limit) - 1;
    const result = await query.order(orderBy, { ascending }).range(from, to);
    const data = ensureNoError(result, `List ${this.tableName}`);

    return {
      data: (data || []).map(this.mapper),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: result.count || 0,
        pages: Math.ceil((result.count || 0) / Number(limit))
      }
    };
  }

  async insert(payload, select = '*') {
    const result = await this.table().insert(payload).select(select).single();
    return this.mapper(ensureNoError(result, `Insert ${this.tableName}`));
  }

  async updateById(id, payload, select = '*') {
    const result = await this.table().update(payload).eq('id', id).select(select).single();
    return this.mapper(ensureNoError(result, `Update ${this.tableName}`));
  }
}

module.exports = {
  BaseRepository,
  RepositoryError,
  ensureNoError
};
