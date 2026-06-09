const { BaseRepository, ensureNoError } = require('./baseRepository');
const { mapUserRow, mapPrivateUserRow } = require('./mappers');

const PUBLIC_USER_SELECT = [
  'id',
  'auth_user_id',
  'name',
  'email',
  'phone',
  'role',
  'profile',
  'provider_details',
  'rating_average',
  'rating_count',
  'completed_jobs_count',
  'wallet_balance',
  'wallet_currency',
  'is_active',
  'fcm_token',
  'created_at',
  'updated_at'
].join(',');

const PRIVATE_USER_SELECT = `${PUBLIC_USER_SELECT},password_hash,refresh_token_hash,reset_password_token,reset_password_expire`;

const quotePostgrestValue = (val) => {
  if (val === null || val === undefined) return 'null';
  const escaped = String(val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
};

class UserRepository extends BaseRepository {
  constructor(clientFactory) {
    super('app_users', mapUserRow, clientFactory);
  }

  async findById(id, { includePrivate = false } = {}) {
    const result = await this.table()
      .select(includePrivate ? PRIVATE_USER_SELECT : PUBLIC_USER_SELECT)
      .eq('id', id)
      .maybeSingle();
    return (includePrivate ? mapPrivateUserRow : mapUserRow)(ensureNoError(result, 'Find user by id'));
  }

  async findForLogin({ email, phone }) {
    const filters = [];
    if (email) filters.push(`email.eq.${quotePostgrestValue(String(email).toLowerCase())}`);
    if (phone) filters.push(`phone.eq.${quotePostgrestValue(phone)}`);

    if (filters.length === 0) {
      return null;
    }

    const result = await this.table()
      .select(PRIVATE_USER_SELECT)
      .or(filters.join(','))
      .maybeSingle();

    return mapPrivateUserRow(ensureNoError(result, 'Find user for login'));
  }

  async findByEmailOrPhone({ email, phone }) {
    const filters = [];
    if (email) filters.push(`email.eq.${quotePostgrestValue(String(email).toLowerCase())}`);
    if (phone) filters.push(`phone.eq.${quotePostgrestValue(phone)}`);

    if (filters.length === 0) {
      return null;
    }

    const result = await this.table()
      .select(PUBLIC_USER_SELECT)
      .or(filters.join(','))
      .maybeSingle();

    return mapUserRow(ensureNoError(result, 'Find user by email or phone'));
  }

  async createUser({ name, email, phone, passwordHash, role = 'customer', profile = {} }) {
    const result = await this.table()
      .insert({
        name,
        email: String(email).toLowerCase(),
        phone,
        password_hash: passwordHash,
        role,
        profile
      })
      .select(PUBLIC_USER_SELECT)
      .single();

    return mapUserRow(ensureNoError(result, 'Create user'));
  }

  async updateRefreshToken(userId, refreshTokenHash) {
    const result = await this.table()
      .update({ refresh_token_hash: refreshTokenHash || null })
      .eq('id', userId)
      .select(PUBLIC_USER_SELECT)
      .single();

    return mapUserRow(ensureNoError(result, 'Update refresh token'));
  }

  async clearRefreshToken(userId) {
    return this.updateRefreshToken(userId, null);
  }

  async updatePasswordReset(userId, { resetPasswordToken, resetPasswordExpire }) {
    const result = await this.table()
      .update({
        reset_password_token: resetPasswordToken || null,
        reset_password_expire: resetPasswordExpire || null
      })
      .eq('id', userId)
      .select(PUBLIC_USER_SELECT)
      .single();

    return mapUserRow(ensureNoError(result, 'Update password reset'));
  }

  async findByResetToken(resetPasswordToken) {
    const result = await this.table()
      .select(PRIVATE_USER_SELECT)
      .eq('reset_password_token', resetPasswordToken)
      .maybeSingle();

    return mapPrivateUserRow(ensureNoError(result, 'Find user by reset token'));
  }

  async updatePassword(userId, passwordHash) {
    const result = await this.table()
      .update({
        password_hash: passwordHash,
        reset_password_token: null,
        reset_password_expire: null,
        refresh_token_hash: null
      })
      .eq('id', userId)
      .select(PUBLIC_USER_SELECT)
      .single();

    return mapUserRow(ensureNoError(result, 'Update password'));
  }

  async updateProfile(userId, updates) {
    const result = await this.table()
      .update(updates)
      .eq('id', userId)
      .select(PUBLIC_USER_SELECT)
      .single();

    return mapUserRow(ensureNoError(result, 'Update user profile'));
  }

  async deleteById(userId) {
    const result = await this.table()
      .delete()
      .eq('id', userId)
      .select(PUBLIC_USER_SELECT)
      .maybeSingle();

    return mapUserRow(ensureNoError(result, 'Delete user'));
  }

  async registerFcmToken(userId, fcmToken) {
    return this.updateProfile(userId, { fcm_token: fcmToken });
  }

  async listUsers({ page = 1, limit = 10, role, search } = {}) {
    let query = this.table().select(PUBLIC_USER_SELECT, { count: 'exact' });

    if (role) {
      query = query.eq('role', role);
    }

    if (search) {
      const escaped = String(search).replace(/[%_]/g, '\\$&');
      const pattern = `%${escaped}%`;
      const quoted = quotePostgrestValue(pattern);
      query = query.or(`name.ilike.${quoted},email.ilike.${quoted},phone.ilike.${quoted}`);
    }

    const from = (Number(page) - 1) * Number(limit);
    const to = from + Number(limit) - 1;
    const result = await query.order('created_at', { ascending: false }).range(from, to);
    const data = ensureNoError(result, 'List users') || [];

    return {
      data: data.map(mapUserRow),
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
  PUBLIC_USER_SELECT,
  PRIVATE_USER_SELECT,
  UserRepository,
  userRepository: new UserRepository()
};
