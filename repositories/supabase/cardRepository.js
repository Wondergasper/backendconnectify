const { BaseRepository, ensureNoError } = require('./baseRepository');
const { mapPaymentCardRow, mapPrivatePaymentCardRow } = require('./mappers');

class CardRepository extends BaseRepository {
  constructor(clientFactory) {
    super('payment_cards', mapPaymentCardRow, clientFactory);
  }

  async listCards(userId, { includePrivate = false } = {}) {
    const result = await this.table()
      .select('*')
      .eq('user_id', userId)
      .neq('status', 'disabled')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    const data = ensureNoError(result, 'List user cards') || [];
    return data.map(includePrivate ? mapPrivatePaymentCardRow : mapPaymentCardRow);
  }

  async countCards(userId) {
    const result = await this.table()
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .neq('status', 'disabled');

    ensureNoError(result, 'Count active cards');
    return result.count || 0;
  }

  async clearDefaults(userId) {
    const result = await this.table()
      .update({ is_default: false })
      .eq('user_id', userId);

    ensureNoError(result, 'Clear default card flags');
  }

  async createCard({ userId, brand, last4, expiryMonth, expiryYear, cardHolderName, authorizationCode, provider = 'paystack', isDefault = false }) {
    if (isDefault) {
      await this.clearDefaults(userId);
    }

    const result = await this.table()
      .insert({
        user_id: userId,
        brand,
        last4,
        expiry_month: expiryMonth,
        expiry_year: expiryYear,
        card_holder_name: cardHolderName,
        authorization_code: authorizationCode,
        provider,
        is_default: isDefault,
        status: 'active'
      })
      .select('*')
      .single();

    return mapPaymentCardRow(ensureNoError(result, 'Create payment card'));
  }

  async findById(id, userId) {
    let query = this.table().select('*').eq('id', id);
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const result = await query.maybeSingle();
    return mapPrivatePaymentCardRow(ensureNoError(result, 'Find card by id'));
  }

  async setDefault(id, userId) {
    await this.clearDefaults(userId);

    const result = await this.table()
      .update({ is_default: true })
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    return mapPaymentCardRow(ensureNoError(result, 'Set default card'));
  }

  async disableCard(id, userId) {
    const result = await this.table()
      .update({ status: 'disabled', is_default: false })
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    return mapPaymentCardRow(ensureNoError(result, 'Disable card'));
  }

  async findFirstActive(userId) {
    const result = await this.table()
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return mapPaymentCardRow(ensureNoError(result, 'Find first active card'));
  }
}

module.exports = {
  CardRepository,
  cardRepository: new CardRepository()
};
