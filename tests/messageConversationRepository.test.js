const test = require('node:test');
const assert = require('node:assert/strict');

const { ConversationRepository } = require('../repositories/supabase/conversationRepository');
const { MessageRepository } = require('../repositories/supabase/messageRepository');

const makeResultQuery = (data, error = null, count = null) => {
  const query = {
    select: () => query,
    eq: () => query,
    neq: () => query,
    in: () => query,
    is: () => query,
    gt: () => query,
    lt: () => query,
    ilike: () => query,
    or: () => query,
    order: () => query,
    range: () => Promise.resolve({ data, error, count }),
    single: () => Promise.resolve({ data, error }),
    maybeSingle: () => Promise.resolve({ data, error }),
    insert: () => query,
    update: () => query,
    delete: () => query,
    limit: () => query
  };
  return query;
};

test('ConversationRepository findById maps conversation row correctly', async () => {
  const fakeClient = {
    from: () => makeResultQuery({
      id: 'conv-123',
      service_id: 'service-456',
      booking_id: 'booking-789',
      name: 'Test Chat',
      is_archived: false,
      is_pinned: true,
      type: 'direct',
      members_count: 2,
      last_message: {
        content: 'Hello, how can I help you?',
        type: 'text',
        sender: 'user-sender',
        timestamp: '2026-05-21T10:00:00.000Z'
      },
      last_message_at: '2026-05-21T10:00:00.000Z',
      is_group: false,
      group_info: {},
      created_at: '2026-05-21T09:00:00.000Z',
      updated_at: '2026-05-21T10:00:00.000Z',
      conversation_participants: [
        {
          conversation_id: 'conv-123',
          user_id: 'user-sender',
          unread_count: 0,
          last_read_message_id: 'msg-99',
          last_read_at: '2026-05-21T10:00:00.000Z',
          user: { id: 'user-sender', name: 'Sender' }
        },
        {
          conversation_id: 'conv-123',
          user_id: 'user-recipient',
          unread_count: 1,
          last_read_message_id: null,
          last_read_at: '2026-05-21T09:00:00.000Z',
          user: { id: 'user-recipient', name: 'Recipient' }
        }
      ]
    })
  };

  const repo = new ConversationRepository(() => fakeClient);
  const conv = await repo.findById('conv-123');

  assert.equal(conv._id, 'conv-123');
  assert.equal(conv.id, 'conv-123');
  assert.equal(conv.service, 'service-456');
  assert.equal(conv.booking, 'booking-789');
  assert.equal(conv.name, 'Test Chat');
  assert.equal(conv.isArchived, false);
  assert.equal(conv.isPinned, true);
  assert.equal(conv.unreadCount, 0); // row mapping field defaults to 0
  assert.equal(conv.type, 'direct');
  assert.equal(conv.membersCount, 2);
  assert.deepEqual(conv.lastMessage, {
    content: 'Hello, how can I help you?',
    type: 'text',
    sender: 'user-sender',
    timestamp: '2026-05-21T10:00:00.000Z'
  });
  assert.equal(conv.participants.length, 2);
  assert.equal(conv.participants[0]._id, 'user-sender');
  assert.equal(conv.participantReadStatus.length, 2);
  assert.equal(conv.participantReadStatus[1].unreadCount, 1);
  assert.equal(conv.participantReadStatus[0].user._id, 'user-sender');
});

test('MessageRepository createMessage inserts and maps payload correctly', async () => {
  const fakeClient = {
    from: () => makeResultQuery({
      id: 'msg-999',
      conversation_id: 'conv-123',
      sender_id: 'user-sender',
      recipient_id: 'user-recipient',
      content: 'I have arrived',
      content_type: 'text',
      attachments: [],
      read: false,
      delivered: true,
      status: 'sent',
      replied_to_id: null,
      created_at: '2026-05-21T10:15:00.000Z',
      updated_at: '2026-05-21T10:15:00.000Z',
      sender: {
        id: 'user-sender',
        name: 'Sender One'
      }
    })
  };

  const repo = new MessageRepository(() => fakeClient);
  const msg = await repo.createMessage({
    conversationId: 'conv-123',
    senderId: 'user-sender',
    recipientId: 'user-recipient',
    content: 'I have arrived'
  });

  assert.equal(msg._id, 'msg-999');
  assert.equal(msg.conversation, 'conv-123');
  assert.equal(msg.sender._id, 'user-sender');
  assert.equal(msg.sender.name, 'Sender One');
  assert.equal(msg.recipient, 'user-recipient');
  assert.equal(msg.content, 'I have arrived');
  assert.equal(msg.contentType, 'text');
  assert.equal(msg.read, false);
  assert.equal(msg.delivered, true);
  assert.equal(msg.status, 'sent');
});
