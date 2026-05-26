const { conversationRepository, messageRepository, userRepository } = require('../repositories/supabase');
const redisService = require('../services/redisService');

// Get conversations for user
exports.getConversations = async (req, res) => {
  try {
    const startTime = Date.now();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const userId = req.user._id || req.user.id;

    // Try to get from Redis cache first
    const cachedConversations = await redisService.getCachedConversations(userId);
    if (cachedConversations) {
      console.log(`Conversations cache HIT for user: ${userId}`);
      const responseTime = Date.now() - startTime;
      return res.json({
        success: true,
        data: cachedConversations,
        cache: true,
        responseTimeMs: responseTime
      });
    }

    // Find all conversations where user is a participant
    const listResult = await conversationRepository.listUserConversations(userId, { page, limit });

    // Map unread count for each conversation based on current user
    const conversationsWithDetails = listResult.data.map(conversation => {
      const userReadStatus = conversation.participantReadStatus.find(status => {
        const statusUserId = status.user && typeof status.user === 'object' ? status.user.id : status.user;
        return String(statusUserId) === String(userId);
      });
      const unreadCount = userReadStatus ? userReadStatus.unreadCount : 0;
      return {
        ...conversation,
        unreadCount
      };
    });

    const responseTime = Date.now() - startTime;

    // Cache the result in Redis for 5 minutes
    await redisService.cacheConversations(userId, conversationsWithDetails, 300);

    res.json({
      success: true,
      data: conversationsWithDetails,
      pagination: listResult.pagination,
      responseTimeMs: responseTime
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get messages in a conversation
exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const userId = req.user._id || req.user.id;

    // Check if user is part of the conversation
    const conversation = await conversationRepository.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    const isParticipant = conversation.participants.some(p => {
      const pId = p && typeof p === 'object' ? p.id : p;
      return String(pId) === String(userId);
    });

    if (!isParticipant) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    // Fetch messages
    const messagesResult = await messageRepository.getConversationMessages(conversationId, { page, limit });

    // Mark messages as read and update conversation read status in background
    if (messagesResult.data.length > 0) {
      const lastMessage = messagesResult.data[0];

      // Update read status for messages sent by other participants
      await messageRepository.markMessagesAsRead(conversationId, userId);

      // Update conversation's participantReadStatus
      await conversationRepository.markAsRead(conversationId, userId, lastMessage.id);

      // Clear user conversations cache
      await redisService.invalidateUserCache(userId);
    }

    res.json({
      success: true,
      data: [...messagesResult.data].reverse(), // Reverse to show in chronological order
      pagination: messagesResult.pagination
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Optimized function to get recent messages for real-time updates
exports.getRecentMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { since, lastMessageId } = req.query;
    const userId = req.user._id || req.user.id;

    // Check if user is part of the conversation
    const conversation = await conversationRepository.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    const isParticipant = conversation.participants.some(p => {
      const pId = p && typeof p === 'object' ? p.id : p;
      return String(pId) === String(userId);
    });

    if (!isParticipant) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    // Fetch new messages
    const messages = await messageRepository.getRecentMessages(conversationId, { since, lastMessageId });

    res.json({
      success: true,
      data: [...messages].reverse(),
      newerExists: messages.length > 0
    });
  } catch (error) {
    console.error('Get recent messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Optimized get latest messages for chat history
exports.getLatestMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const userId = req.user._id || req.user.id;

    // Check if user is part of the conversation
    const conversation = await conversationRepository.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    const isParticipant = conversation.participants.some(p => {
      const pId = p && typeof p === 'object' ? p.id : p;
      return String(pId) === String(userId);
    });

    if (!isParticipant) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    // Get latest messages
    const messagesResult = await messageRepository.getConversationMessages(conversationId, { page: 1, limit });

    // Update read status in background
    if (messagesResult.data.length > 0) {
      const lastMessage = messagesResult.data[0];
      await messageRepository.markMessagesAsRead(conversationId, userId);
      await conversationRepository.markAsRead(conversationId, userId, lastMessage.id);
      await redisService.invalidateUserCache(userId);
    }

    res.json({
      success: true,
      data: [...messagesResult.data].reverse()
    });
  } catch (error) {
    console.error('Get latest messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// New function to cleanup old messages (for TTL)
exports.cleanupOldMessages = async (req, res) => {
  try {
    const result = await messageRepository.cleanupOldMessages(90);

    res.json({
      success: true,
      deleted: result.deletedCount,
      message: `Cleaned up ${result.deletedCount} messages older than 90 days`
    });
  } catch (error) {
    console.error('Cleanup old messages error:', error);
    res.status(500).json({ error: 'Server error during cleanup' });
  }
};

// Send a message
exports.sendMessage = async (req, res) => {
  try {
    const { conversationId, content } = req.body;
    const userId = req.user._id || req.user.id;

    // Check if user is part of the conversation
    const conversation = await conversationRepository.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    const isParticipant = conversation.participants.some(p => {
      const pId = p && typeof p === 'object' ? p.id : p;
      return String(pId) === String(userId);
    });

    if (!isParticipant) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    const otherParticipant = conversation.participants.find(p => {
      const pId = p && typeof p === 'object' ? p.id : p;
      return String(pId) !== String(userId);
    });
    const recipientId = otherParticipant && typeof otherParticipant === 'object' ? otherParticipant.id : otherParticipant;

    // Create the message
    const message = await messageRepository.createMessage({
      conversationId,
      senderId: userId,
      recipientId,
      content
    });

    // Update conversation with last message details
    await conversationRepository.updateLastMessage(conversationId, content, userId);

    // Emit WebSocket events for real-time updates
    const io = req.app.get('io');
    if (io) {
      // Emit to sender (confirmation)
      io.to(`user_${userId}`).emit('newMessage', {
        ...message,
        conversationId
      });

      // Emit to recipient (new message notification)
      if (recipientId) {
        io.to(`user_${recipientId}`).emit('newMessage', {
          ...message,
          conversationId
        });
      }

      // Update conversation list for both users
      const updatedConversation = await conversationRepository.findById(conversationId);
      if (updatedConversation) {
        io.to(`user_${userId}`).emit('conversationUpdated', [updatedConversation]);
        if (recipientId) {
          io.to(`user_${recipientId}`).emit('conversationUpdated', [updatedConversation]);
        }
      }
    }

    // Invalidate conversation cache for both participants
    await redisService.invalidateUserCache(userId);
    if (recipientId) {
      await redisService.invalidateUserCache(recipientId);
    }

    res.status(201).json({
      success: true,
      message
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Create a new conversation
exports.createConversation = async (req, res) => {
  try {
    const { recipientId, serviceId, bookingId } = req.body;
    const userId = req.user._id || req.user.id;

    // Check if recipient exists
    const recipient = await userRepository.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    // Check if a conversation already exists between these users
    let conversation = await conversationRepository.findConversationBetweenUsers(userId, recipientId, serviceId, bookingId);

    if (conversation) {
      return res.json({
        success: true,
        conversation
      });
    }

    // Create new conversation
    conversation = await conversationRepository.createConversation({
      participants: [userId, recipientId],
      serviceId,
      bookingId
    });

    res.status(201).json({
      success: true,
      conversation
    });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get messages between current user and a specific user
exports.getMessagesWithUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const currentUserId = req.user._id || req.user.id;

    // Check if the specified user exists
    const otherUser = await userRepository.findById(userId);
    if (!otherUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Find the conversation between these users
    const conversation = await conversationRepository.findConversationBetweenUsers(currentUserId, userId);

    if (!conversation) {
      return res.status(404).json({ error: 'No conversation found with this user' });
    }

    const messagesResult = await messageRepository.getConversationMessages(conversation.id, { page, limit });

    // Update read status for messages sent by other participant
    await messageRepository.markMessagesAsRead(conversation.id, currentUserId);

    // Update conversation's last read time
    const lastMessage = messagesResult.data[0];
    if (lastMessage) {
      await conversationRepository.markAsRead(conversation.id, currentUserId, lastMessage.id);
    }
    await redisService.invalidateUserCache(currentUserId);

    res.json({
      success: true,
      data: [...messagesResult.data].reverse(), // Reverse to show in chronological order
      pagination: messagesResult.pagination
    });
  } catch (error) {
    console.error('Get messages with user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Search conversations by participant name or service
exports.searchConversations = async (req, res) => {
  try {
    const { search } = req.query;
    const userId = req.user._id || req.user.id;

    if (!search) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // Search conversations
    const filteredConversations = await conversationRepository.searchConversations(userId, search);

    res.json({
      success: true,
      data: filteredConversations
    });
  } catch (error) {
    console.error('Search conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Mark all messages in a conversation as read
exports.markConversationAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id || req.user.id;

    // Check if user is part of the conversation
    const conversation = await conversationRepository.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    const isParticipant = conversation.participants.some(p => {
      const pId = p && typeof p === 'object' ? p.id : p;
      return String(pId) === String(userId);
    });

    if (!isParticipant) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    // Update read status for the current user
    const messagesResult = await messageRepository.getConversationMessages(conversationId, { page: 1, limit: 1 });
    const lastMessage = messagesResult.data[0];

    if (lastMessage) {
      await messageRepository.markMessagesAsRead(conversationId, userId);
      await conversationRepository.markAsRead(conversationId, userId, lastMessage.id);
      await redisService.invalidateUserCache(userId);
    }

    res.json({
      success: true,
      message: 'Conversation marked as read'
    });
  } catch (error) {
    console.error('Mark conversation as read error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get user's unread message count
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const totalUnread = await conversationRepository.getUnreadCount(userId);

    res.json({
      success: true,
      data: { unreadCount: totalUnread }
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};