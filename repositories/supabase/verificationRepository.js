const { BaseRepository, ensureNoError } = require('./baseRepository');
const { mapVerificationRow } = require('./mappers');

const USER_FIELDS = 'id,name,email,role,profile,provider_details,rating_average,rating_count,completed_jobs_count,wallet_balance,wallet_currency,is_active,created_at,updated_at';
const ADMIN_FIELDS = 'id,name,email,role,is_active';

const VERIFICATION_SELECT = `*,user:user_id(${USER_FIELDS}),verified_by:verified_by(${ADMIN_FIELDS})`;

class VerificationRepository extends BaseRepository {
  constructor(clientFactory) {
    super('verification_requests', mapVerificationRow, clientFactory);
  }

  async findById(id) {
    const result = await this.table()
      .select(VERIFICATION_SELECT)
      .eq('id', id)
      .maybeSingle();

    return mapVerificationRow(ensureNoError(result, 'Find verification request by id'));
  }

  async findByUserId(userId) {
    const result = await this.table()
      .select(VERIFICATION_SELECT)
      .eq('user_id', userId)
      .maybeSingle();

    return mapVerificationRow(ensureNoError(result, 'Find verification request by user id'));
  }

  async upsertVerification({ userId, documentType, documentNumber, documentFront, documentBack, additionalInfo }) {
    const result = await this.table()
      .upsert({
        user_id: userId,
        document_type: documentType,
        document_number: documentNumber,
        document_front: documentFront,
        document_back: documentBack || null,
        status: 'PENDING',
        verified_by: null,
        verification_date: null,
        rejection_reason: null,
        additional_info: additionalInfo || {},
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select(VERIFICATION_SELECT)
      .single();

    return mapVerificationRow(ensureNoError(result, 'Upsert verification request'));
  }

  async listVerifications({ page = 1, limit = 10, status, type } = {}) {
    let query = this.table().select(VERIFICATION_SELECT, { count: 'exact' });

    if (status) {
      query = query.eq('status', status.toUpperCase());
    }

    if (type === 'identity' || type === 'kyc') {
      query = query.in('document_type', ['ID', 'PASSPORT']);
    } else if (type === 'professional') {
      query = query.in('document_type', ['LICENSE', 'CERTIFICATE', 'BUSINESS_LICENSE', 'OTHER']);
    }

    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 10;
    const from = (numericPage - 1) * numericLimit;
    const to = from + numericLimit - 1;

    const result = await query.order('created_at', { ascending: false }).range(from, to);
    const data = ensureNoError(result, 'List verification requests') || [];

    return {
      data: data.map(mapVerificationRow),
      pagination: {
        page: numericPage,
        limit: numericLimit,
        total: result.count || 0,
        pages: Math.ceil((result.count || 0) / numericLimit)
      }
    };
  }

  async approveVerification(id, adminId) {
    const result = await this.table()
      .update({
        status: 'APPROVED',
        verified_by: adminId,
        verification_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(VERIFICATION_SELECT)
      .single();

    return mapVerificationRow(ensureNoError(result, 'Approve verification request'));
  }

  async rejectVerification(id, adminId, reason) {
    const result = await this.table()
      .update({
        status: 'REJECTED',
        verified_by: adminId,
        verification_date: new Date().toISOString(),
        rejection_reason: reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(VERIFICATION_SELECT)
      .single();

    return mapVerificationRow(ensureNoError(result, 'Reject verification request'));
  }
}

module.exports = {
  VERIFICATION_SELECT,
  VerificationRepository,
  verificationRepository: new VerificationRepository()
};
