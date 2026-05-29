const { BaseRepository, ensureNoError } = require('./baseRepository');
const { mapTeamMemberRow } = require('./mappers');

const MEMBER_SELECT = [
  'id',
  'provider_id',
  'full_name',
  'role',
  'phone',
  'email',
  'status',
  'created_at',
  'updated_at'
].join(',');

class TeamMemberRepository extends BaseRepository {
  constructor(clientFactory) {
    super('company_team_members', mapTeamMemberRow, clientFactory);
  }

  async create(payload) {
    const { providerId, fullName, role, phone, email, status = 'active' } = payload;

    const result = await this.table()
      .insert({
        provider_id: providerId,
        full_name: fullName,
        role,
        phone,
        email: email || null,
        status
      })
      .select(MEMBER_SELECT)
      .single();

    return mapTeamMemberRow(ensureNoError(result, 'Create team member'));
  }

  async listByProviderId(providerId, { page = 1, limit = 50 } = {}) {
    const from = (Number(page) - 1) * Number(limit);
    const to = from + Number(limit) - 1;

    const result = await this.table()
      .select(MEMBER_SELECT, { count: 'exact' })
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
      .range(from, to);

    const data = ensureNoError(result, 'List team members') || [];

    return {
      data: data.map(mapTeamMemberRow),
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
      .select(MEMBER_SELECT)
      .eq('id', id)
      .eq('provider_id', providerId)
      .maybeSingle();

    return mapTeamMemberRow(ensureNoError(result, 'Find team member by id'));
  }

  async updateByIdAndProviderId(id, providerId, updates) {
    const payload = {};
    if (updates.fullName !== undefined) payload.full_name = updates.fullName;
    if (updates.role !== undefined) payload.role = updates.role;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.email !== undefined) payload.email = updates.email;
    if (updates.status !== undefined) payload.status = updates.status;

    const result = await this.table()
      .update(payload)
      .eq('id', id)
      .eq('provider_id', providerId)
      .select(MEMBER_SELECT)
      .single();

    return mapTeamMemberRow(ensureNoError(result, 'Update team member'));
  }

  async deleteByIdAndProviderId(id, providerId) {
    const result = await this.table()
      .delete()
      .eq('id', id)
      .eq('provider_id', providerId)
      .select(MEMBER_SELECT)
      .maybeSingle();

    return mapTeamMemberRow(ensureNoError(result, 'Delete team member'));
  }
}

module.exports = {
  TeamMemberRepository,
  teamMemberRepository: new TeamMemberRepository()
};
