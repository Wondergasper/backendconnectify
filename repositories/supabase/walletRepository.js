const { BaseRepository, ensureNoError } = require('./baseRepository');
const { mapWalletTransactionRow } = require('./mappers');

const USER_WALLET_SELECT = 'id,wallet_balance,wallet_currency';
const WALLET_TRANSACTION_SELECT = '*,user:user_id(id,name,email,phone,role,profile,provider_details,rating_average,rating_count,completed_jobs_count,wallet_balance,wallet_currency,is_active,created_at,updated_at)';

const stripUndefined = (payload) =>
  Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));

const mapRpcResult = (result, context) => ensureNoError(result, context) || {};

class WalletRepository extends BaseRepository {
  constructor(clientFactory) {
    super('wallet_transactions', mapWalletTransactionRow, clientFactory);
  }

  async getWalletBalance(userId) {
    const result = await this.client
      .from('app_users')
      .select(USER_WALLET_SELECT)
      .eq('id', userId)
      .maybeSingle();

    const row = ensureNoError(result, 'Get wallet balance');
    if (!row) return null;

    return {
      balance: Number(row.wallet_balance || 0),
      currency: row.wallet_currency || 'NGN',
      availableBalance: Number(row.wallet_balance || 0)
    };
  }

  async createTransaction({ userId, type, amount, currency = 'NGN', description, reference, status = 'pending', metadata = {} }) {
    const result = await this.table()
      .insert(stripUndefined({
        user_id: userId,
        type,
        amount,
        currency,
        description,
        reference,
        status,
        metadata
      }))
      .select(WALLET_TRANSACTION_SELECT)
      .single();

    return mapWalletTransactionRow(ensureNoError(result, 'Create wallet transaction'));
  }

  async findByReference(reference) {
    const result = await this.table()
      .select(WALLET_TRANSACTION_SELECT)
      .eq('reference', reference)
      .maybeSingle();

    return mapWalletTransactionRow(ensureNoError(result, 'Find wallet transaction by reference'));
  }

  async listTransactions({ userId, type, page = 1, limit = 10 } = {}) {
    let query = this.table()
      .select(WALLET_TRANSACTION_SELECT, { count: 'exact' })
      .eq('user_id', userId);

    if (type) {
      query = query.eq('type', type);
    }

    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 10;
    const from = (numericPage - 1) * numericLimit;
    const to = from + numericLimit - 1;
    const result = await query.order('created_at', { ascending: false }).range(from, to);
    const data = ensureNoError(result, 'List wallet transactions') || [];

    return {
      data: data.map(mapWalletTransactionRow),
      pagination: {
        page: numericPage,
        limit: numericLimit,
        total: result.count || 0,
        pages: Math.ceil((result.count || 0) / numericLimit)
      }
    };
  }

  async updateStatusByReference(reference, status, metadata) {
    const payload = stripUndefined({ status, metadata });
    const result = await this.table()
      .update(payload)
      .eq('reference', reference)
      .select(WALLET_TRANSACTION_SELECT)
      .maybeSingle();

    return mapWalletTransactionRow(ensureNoError(result, 'Update wallet transaction status'));
  }

  async creditPendingTopup({ userId, reference, amount }) {
    return mapRpcResult(await this.client.rpc('credit_wallet_from_pending_transaction', {
      p_user_id: userId,
      p_reference: reference,
      p_amount: amount
    }), 'Credit pending wallet top-up');
  }

  async createManualCredit({ userId, amount, currency = 'NGN', reference, description, metadata = {} }) {
    return mapRpcResult(await this.client.rpc('create_manual_wallet_credit', {
      p_user_id: userId,
      p_amount: amount,
      p_currency: currency,
      p_reference: reference,
      p_description: description,
      p_metadata: metadata
    }), 'Create manual wallet credit');
  }

  async createWithdrawalDebit({ userId, amount, currency = 'NGN', reference, description, metadata = {} }) {
    return mapRpcResult(await this.client.rpc('create_wallet_withdrawal_debit', {
      p_user_id: userId,
      p_amount: amount,
      p_currency: currency,
      p_reference: reference,
      p_description: description,
      p_metadata: metadata
    }), 'Create wallet withdrawal debit');
  }

  async refundWithdrawal({ userId, reference }) {
    return mapRpcResult(await this.client.rpc('refund_wallet_withdrawal', {
      p_user_id: userId,
      p_reference: reference
    }), 'Refund wallet withdrawal');
  }

  async processBookingPayment({ bookingId, customerId, customerReference, providerReference }) {
    return mapRpcResult(await this.client.rpc('process_booking_wallet_payment', {
      p_booking_id: bookingId,
      p_customer_id: customerId,
      p_customer_reference: customerReference,
      p_provider_reference: providerReference
    }), 'Process booking wallet payment');
  }
}

module.exports = {
  USER_WALLET_SELECT,
  WALLET_TRANSACTION_SELECT,
  WalletRepository,
  walletRepository: new WalletRepository()
};
