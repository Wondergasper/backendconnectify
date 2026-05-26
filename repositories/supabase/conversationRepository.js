const { BaseRepository, ensureNoError } = require('./baseRepository');
const { mapConversationRow } = require('./mappers');

const CONVERSATION_SELECT = `
  *,
  conversation_participants(*,user:user_id(id,name,email,phone,role,profile,provider_details,rating_average,rating_count,completed_jobs_count,wallet_balance,wallet_currency,is_active,created_at,updated_at)),
  service:service_id(id,name,provider_id,category,description,price,price_type,duration_minutes,images,location,rating_average,rating_count,services_offered,gallery,is_active,created_at,updated_at),
  booking:booking_id(id,customer_id,provider_id,service_id,date,start_time,duration_minutes,status,total_amount,currency,payment_status,notes,address,completed_at,rating,service_images,reminder_sent,created_at,updated_at)
`.replace(/\s+/g, '');

class ConversationRepository extends BaseRepository {
  constructor(clientFactory) {
    super('conversations', mapConversationRow, clientFactory);
  }

  async findById(id) {
    const result = await this.table()
      .select(CONVERSATION_SELECT)
      .eq('id', id)
      .maybeSingle();

    return mapConversationRow(ensureNoError(result, 'Find conversation by id'));
  }

  async findConversationBetweenUsers(user1Id, user2Id, serviceId = null, bookingId = null) {
    // Get all conversations for user1
    const user1Parts = await this.client
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user1Id);

    const conversationIds = (user1Parts.data || []).map(p => p.conversation_id);
    if (conversationIds.length === 0) return null;

    // Find direct conversations where service and booking match
    let query = this.table()
      .select(CONVERSATION_SELECT)
      .in('id', conversationIds)
      .eq('type', 'direct');

    if (serviceId) {
      query = query.eq('service_id', serviceId);
    } else {
      query = query.is('service_id', null);
    }

    if (bookingId) {
      query = query.eq('booking_id', bookingId);
    } else {
      query = query.is('booking_id', null);
    }

    const result = await query;
    ensureNoError(result, 'Find conversation between users');

    // Filter conversations where user2 is also a participant
    const match = (result.data || []).find(conv =>
      conv.conversation_participants.some(p => p.user_id === user2Id)
    );

    return mapConversationRow(match);
  }

  async createConversation({ participants, serviceId, bookingId, name, type = 'direct', isGroup = false, groupInfo = {} }) {
    const convResult = await this.table()
      .insert({
        service_id: serviceId || null,
        booking_id: bookingId || null,
        name: name || null,
        type,
        is_group: isGroup,
        group_info: groupInfo,
        members_count: participants.length
      })
      .select('id')
      .single();

    const newConv = ensureNoError(convResult, 'Create conversation row');
    const conversationId = newConv.id;

    // Insert participants
    const participantRows = participants.map(userId => ({
      conversation_id: conversationId,
      user_id: userId,
      unread_count: 0
    }));

    const partsResult = await this.client
      .from('conversation_participants')
      .insert(participantRows);

    ensureNoError(partsResult, 'Create conversation participants');

    return this.findById(conversationId);
  }

  async listUserConversations(userId, { page = 1, limit = 10 } = {}) {
    const userParts = await this.client
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId);

    const conversationIds = (userParts.data || []).map(p => p.conversation_id);
    if (conversationIds.length === 0) {
      return {
        data: [],
        pagination: { page: Number(page), limit: Number(limit), total: 0, pages: 0 }
      };
    }

    let query = this.table()
      .select(CONVERSATION_SELECT, { count: 'exact' })
      .in('id', conversationIds);

    const from = (Number(page) - 1) * Number(limit);
    const to = from + Number(limit) - 1;
    const result = await query.order('last_message_at', { ascending: false }).range(from, to);
    const data = ensureNoError(result, 'List user conversations') || [];

    return {
      data: data.map(mapConversationRow),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: result.count || 0,
        pages: Math.ceil((result.count || 0) / Number(limit))
      }
    };
  }

  async updateLastMessage(conversationId, content, senderId, type = 'text') {
    const convResult = await this.table()
      .update({
        last_message: {
          content,
          type,
          sender: senderId,
          timestamp: new Date().toISOString()
        },
        last_message_at: new Date().toISOString()
      })
      .eq('id', conversationId);
    ensureNoError(convResult, 'Update last message info');

    // Get all participants to increment unread counts
    const parts = await this.client
      .from('conversation_participants')
      .select('user_id, unread_count')
      .eq('conversation_id', conversationId);

    const participants = parts.data || [];
    for (const p of participants) {
      if (p.user_id !== senderId) {
        await this.client
          .from('conversation_participants')
          .update({ unread_count: (p.unread_count || 0) + 1 })
          .eq('conversation_id', conversationId)
          .eq('user_id', p.user_id);
      }
    }
  }

  async markAsRead(conversationId, userId, lastMessageId) {
    const result = await this.client
      .from('conversation_participants')
      .update({
        unread_count: 0,
        last_read_message_id: lastMessageId || null,
        last_read_at: new Date().toISOString()
      })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);

    ensureNoError(result, 'Mark conversation as read');
    return this.findById(conversationId);
  }

  async getUnreadCount(userId) {
    const result = await this.client
      .from('conversation_participants')
      .select('unread_count')
      .eq('user_id', userId);

    const data = ensureNoError(result, 'Get user total unread count') || [];
    return data.reduce((sum, row) => sum + Number(row.unread_count || 0), 0);
  }

  async searchConversations(userId, searchString) {
    const userParts = await this.client
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId);

    const conversationIds = (userParts.data || []).map(p => p.conversation_id);
    if (conversationIds.length === 0) return [];

    const result = await this.table()
      .select(CONVERSATION_SELECT)
      .in('id', conversationIds);

    const conversations = (ensureNoError(result, 'Search conversations') || []).map(mapConversationRow);
    if (!searchString) return conversations;

    const term = searchString.toLowerCase();
    return conversations.filter(conv => {
      const otherParticipant = conv.participants.find(p => p && p.id !== userId);
      const participantMatches = otherParticipant && otherParticipant.name && otherParticipant.name.toLowerCase().includes(term);
      const serviceMatches = conv.service && conv.service.name && conv.service.name.toLowerCase().includes(term);
      return Boolean(participantMatches || serviceMatches);
    });
  }
}

module.exports = {
  CONVERSATION_SELECT,
  ConversationRepository,
  conversationRepository: new ConversationRepository()
};
