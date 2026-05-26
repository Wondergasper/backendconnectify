const { BaseRepository, ensureNoError } = require('./baseRepository');
const { mapMessageRow } = require('./mappers');

const MESSAGE_SELECT = `
  *,
  sender:sender_id(id,name,email,phone,role,profile,provider_details,rating_average,rating_count,completed_jobs_count,wallet_balance,wallet_currency,is_active,created_at,updated_at)
`.replace(/\s+/g, '');

class MessageRepository extends BaseRepository {
  constructor(clientFactory) {
    super('messages', mapMessageRow, clientFactory);
  }

  async findById(id) {
    const result = await this.table()
      .select(MESSAGE_SELECT)
      .eq('id', id)
      .maybeSingle();

    return mapMessageRow(ensureNoError(result, 'Find message by id'));
  }

  async createMessage({ conversationId, senderId, recipientId, content, contentType = 'text', attachments = [], repliedTo = null }) {
    const result = await this.table()
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        recipient_id: recipientId,
        content,
        content_type: contentType || 'text',
        attachments: attachments || [],
        replied_to_id: repliedTo || null,
        status: 'sent'
      })
      .select(MESSAGE_SELECT)
      .single();

    return mapMessageRow(ensureNoError(result, 'Create message'));
  }

  async getConversationMessages(conversationId, { page = 1, limit = 20 } = {}) {
    let query = this.table()
      .select(MESSAGE_SELECT, { count: 'exact' })
      .eq('conversation_id', conversationId);

    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 20;
    const from = (numericPage - 1) * numericLimit;
    const to = from + numericLimit - 1;

    const result = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    const data = ensureNoError(result, 'Get conversation messages') || [];

    return {
      data: data.map(mapMessageRow),
      pagination: {
        page: numericPage,
        limit: numericLimit,
        total: result.count || 0,
        pages: Math.ceil((result.count || 0) / numericLimit)
      }
    };
  }

  async getRecentMessages(conversationId, { since, lastMessageId, limit = 50 } = {}) {
    let query = this.table()
      .select(MESSAGE_SELECT)
      .eq('conversation_id', conversationId);

    if (since) {
      query = query.gt('created_at', new Date(since).toISOString());
    } else if (lastMessageId) {
      const lastMsg = await this.findById(lastMessageId);
      if (lastMsg) {
        query = query.gt('created_at', lastMsg.createdAt);
      }
    }

    const result = await query
      .order('created_at', { ascending: false })
      .limit(Number(limit) || 50);

    const data = ensureNoError(result, 'Get recent messages') || [];
    return data.map(mapMessageRow);
  }

  async markMessagesAsRead(conversationId, excludeSenderId) {
    const result = await this.table()
      .update({ read: true, status: 'read' })
      .eq('conversation_id', conversationId)
      .neq('sender_id', excludeSenderId)
      .eq('read', false);

    ensureNoError(result, 'Mark messages as read');
  }

  async cleanupOldMessages(days = 90) {
    const cutoffDate = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString();
    const result = await this.table()
      .delete()
      .lt('created_at', cutoffDate);

    const data = ensureNoError(result, 'Cleanup old messages');
    return { deletedCount: data ? data.length : 0 };
  }
}

module.exports = {
  MESSAGE_SELECT,
  MessageRepository,
  messageRepository: new MessageRepository()
};
