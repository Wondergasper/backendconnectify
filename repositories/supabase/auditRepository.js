const { BaseRepository, ensureNoError } = require('./baseRepository');
const { mapAuditLogRow } = require('./mappers');

const AUDIT_SELECT = '*,actor:actor_id(id,name,email,phone,role,profile,provider_details,rating_average,rating_count,completed_jobs_count,wallet_balance,wallet_currency,is_active,created_at,updated_at)';

const quotePostgrestValue = (val) => {
  if (val === null || val === undefined) return 'null';
  const escaped = String(val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
};

class AuditRepository extends BaseRepository {
  constructor(clientFactory) {
    super('audit_logs', mapAuditLogRow, clientFactory);
  }

  async createLog({ actorId, actorName, actorRole, action, entityType, entityId, target, metadata, ipAddress, userAgent }) {
    return this.insert({
      actor_id: actorId || null,
      actor_name: actorName || 'System',
      actor_role: actorRole || 'system',
      action,
      entity_type: entityType,
      entity_id: entityId,
      target,
      metadata: metadata || {},
      ip_address: ipAddress,
      user_agent: userAgent
    });
  }

  async list({ page = 1, limit = 25, search, entityType } = {}) {
    let query = this.table().select(AUDIT_SELECT, { count: 'exact' });

    if (entityType) {
      query = query.eq('entity_type', entityType);
    }

    if (search) {
      const escaped = String(search).replace(/[%_]/g, '\\$&');
      const pattern = `%${escaped}%`;
      const quoted = quotePostgrestValue(pattern);
      query = query.or(`actor_name.ilike.${quoted},action.ilike.${quoted},target.ilike.${quoted},entity_type.ilike.${quoted}`);
    }

    const from = (Number(page) - 1) * Number(limit);
    const to = from + Number(limit) - 1;
    const result = await query.order('created_at', { ascending: false }).range(from, to);
    const data = ensureNoError(result, 'List audit logs') || [];

    return {
      data: data.map(mapAuditLogRow),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: result.count || 0,
        pages: Math.ceil((result.count || 0) / Number(limit))
      }
    };
  }
}

module.exports = {
  AuditRepository,
  auditRepository: new AuditRepository()
};
