const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const redisService = require('../services/redisService');

// Get conversations for user
exports.getConversations = async (req, res) => {
  try {
    const startTime = Date.now();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Generate cache key based on user ID and pagination
    const cacheKey = `conversations:${req.user._id}:${page}:${limit}`;

    // Try to get from Redis cache first
    const cachedConversations = await redisService.getCachedConversations(req.user._id);
    if (cachedConversations) {
      console.log(`Conversations cache HIT for user: ${req.user._id}`);
      const responseTime = Date.now() - startTime;
      return res.json({
        success: true,
        data: cachedConversations,
        cache: true,
        responseTimeMs: responseTime
      });
    }

    // Find all conversations where user is a participant with optimized query
    const conversations = await Conversation.find({
      participants: req.user._id
    })
      .select('_id participants service lastMessage lastMessageAt participantReadStatus') // Only select needed fields
      .populate({
        path: 'participants',
        select: 'name profile.avatar _id' // Only select needed fields
      })
      .populate('service', 'name _id') // Only select needed fields
      .sort({ lastMessageAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .lean(); // Use lean() to return plain objects

    // Use aggregation pipeline for better performance with multiple operations
    const conversationsWithDetails = await Promise.all(
      conversations.map(async (conversation) => {
        // Get last message efficiently
        const lastMessage = await Message.findOne({
          conversation: conversation._id
        })
          .select('content createdAt sender') // Only select needed fields
          .sort({ createdAt: -1 })
          .lean();

        // Efficiently calculate unread count
        const readStatus = conversation.participantReadStatus.find(status =>
          status.user.toString() === req.user._id.toString()
        );

        let unreadCount = 0;

        if (readStatus && readStatus.lastReadAt) {
          // Count unread messages from the time user last read
          unreadCount = await Message.countDocuments({
            conversation: conversation._id,
            createdAt: { $gt: readStatus.lastReadAt },
            sender: { $ne: req.user._id }
          });
        } else {
          // Count all messages from other participants if never read
          unreadCount = await Message.countDocuments({
            conversation: conversation._id,
            sender: { $ne: req.user._id }
          });
        }

        // Update the conversation's unread count
        await Conversation.updateOne(
          { _id: conversation._id, 'participantReadStatus.user': req.user._id },
          { $set: { 'participantReadStatus.$.unreadCount': unreadCount } }
        );

        return {
          ...conversation,
          lastMessage: lastMessage ? lastMessage.content : conversation.lastMessage,
          lastMessageAt: lastMessage ? lastMessage.createdAt : conversation.lastMessageAt,
          unreadCount
        };
      })
    );

    // Count total conversations efficiently
    const total = await Conversation.countDocuments({
      participants: req.user._id
    });

    const responseTime = Date.now() - startTime;

    // Cache the result in Redis for 5 minutes
    await redisService.cacheConversations(req.user._id, conversationsWithDetails, 300); // 5 minutes

    res.json({
      success: true,
      data: conversationsWithDetails,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
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

    // Check if user is part of the conversation with efficient query
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id
    }).select('_id participants participantReadStatus'); // Only select needed fields

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    // Use efficient query with projection to limit data
    const messages = await Message.find({
      conversation: conversationId
    })
      .populate({
        path: 'sender',
        select: 'name profile.avatar _id' // Only select needed sender fields
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .select('-readBy -reactions') // Exclude large arrays that aren't needed for display
      .lean(); // Use lean() to return plain JS objects (faster)

    // Batch-update read status using aggregation pipeline
    const lastMessage = await Message.findOne({
      conversation: conversationId
    })
      .sort({ createdAt: -1 })
      .select('_id')
      .lean();

    if (lastMessage) {
      // Use findOneAndUpdate to atomically update the conversation
      await Conversation.findOneAndUpdate(
        {
          _id: conversationId,
          'participantReadStatus.user': req.user._id
        },
        {
          $set: {
            'participantReadStatus.$.lastReadMessage': lastMessage._id,
            'participantReadStatus.$.lastReadAt': new Date(),
            'participantReadStatus.$.unreadCount': 0 // Reset unread count
          }
        }
      );

      // If user not found in readStatus, add them
      await Conversation.findOneAndUpdate(
        {
          _id: conversationId,
          'participantReadStatus.user': { $ne: req.user._id }
        },
        {
          $push: {
            participantReadStatus: {
              user: req.user._id,
              lastReadMessage: lastMessage._id,
              lastReadAt: new Date(),
              unreadCount: 0
            }
          }
        }
      );
    }

    // Count total messages efficiently
    const total = await Message.countDocuments({ conversation: conversationId });

    res.json({
      success: true,
      data: messages.reverse(), // Reverse to show in chronological order
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
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

    // Check if user is part of the conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    // Build query based on provided parameters
    let query = { conversation: conversationId };

    if (since) {
      // Get messages since a specific timestamp
      query.createdAt = { $gt: new Date(since) };
    } else if (lastMessageId) {
      // Get messages after a specific message ID
      const lastMessage = await Message.findById(lastMessageId);
      if (lastMessage) {
        query.createdAt = { $gt: lastMessage.createdAt };
      }
    }

    // Fetch new messages with optimized query
    const messages = await Message.find(query)
      .populate({
        path: 'sender',
        select: 'name profile.avatar _id'
      })
      .sort({ createdAt: -1 })
      .limit(50) // Limit to prevent large data transfers
      .select('-readBy -reactions')
      .lean();

    res.json({
      success: true,
      data: messages.reverse(),
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

    // Check if user is part of the conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    // Get latest messages with optimized projections
    const messages = await Message.find({ conversation: conversationId })
      .populate({
        path: 'sender',
        select: 'name profile.avatar _id'
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-readBy -reactions')
      .lean();

    // Update read status in background
    if (messages.length > 0) {
      // Update read status for the user
      const lastMessage = messages[0]; // Most recent message
      await Conversation.updateOne(
        { _id: conversationId, 'participantReadStatus.user': req.user._id },
        {
          $set: {
            'participantReadStatus.$.lastReadMessage': lastMessage._id,
            'participantReadStatus.$.lastReadAt': new Date(),
            'participantReadStatus.$.unreadCount': 0
          }
        }
      );
    }

    res.json({
      success: true,
      data: messages.reverse()
    });
  } catch (error) {
    console.error('Get latest messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// New function to cleanup old messages (for TTL)
exports.cleanupOldMessages = async (req, res) => {
  try {
    // This function can be called periodically to clean up old messages
    // It's designed to be called internally, not by API
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago

    const deleted = await Message.deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    res.json({
      success: true,
      deleted: deleted.deletedCount,
      message: `Cleaned up ${deleted.deletedCount} messages older than 90 days`
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

    // Check if user is part of the conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    const message = new Message({
      conversation: conversationId,
      sender: req.user._id,
      recipient: conversation.participants.find(p => p.toString() !== req.user._id.toString()), // Other participant
      content
    });

    await message.save();

    // Update conversation with last message
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: content,
      lastMessageAt: new Date()
    });

    await message.populate('sender', 'name profile.avatar');

    // Emit WebSocket events for real-time updates
    const io = req.app.get('io'); // Get Socket.IO instance from app
    if (io) {
      const recipientId = conversation.participants.find(p => p.toString() !== req.user._id.toString());

      // Emit to sender (confirmation)
      io.to(`user_${req.user._id}`).emit('newMessage', {
        ...message.toObject(),
        conversationId
      });

      // Emit to recipient (new message notification)
      if (recipientId) {
        io.to(`user_${recipientId}`).emit('newMessage', {
          ...message.toObject(),
          conversationId
        });
      }

      // Update conversation list for both users
      const updatedConversation = await Conversation.findById(conversationId)
        .populate('participants', 'name profile.avatar')
        .populate('service', 'name');

      if (updatedConversation) {
        io.to(`user_${req.user._id}`).emit('conversationUpdated', [updatedConversation]);
        if (recipientId) {
          io.to(`user_${recipientId}`).emit('conversationUpdated', [updatedConversation]);
        }
      }
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

    // Check if both users exist
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    // Check if a conversation already exists between these users
    let conversation = await Conversation.findOne({
      participants: { $all: [req.user._id, recipientId] },
      service: serviceId || null,
      booking: bookingId || null
    });

    if (conversation) {
      return res.json({
        success: true,
        conversation
      });
    }

    // Create new conversation
    conversation = new Conversation({
      participants: [req.user._id, recipientId],
      service: serviceId || null,
      booking: bookingId || null
    });

    await conversation.save();

    await conversation.populate({
      path: 'participants',
      select: 'name profile.avatar'
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

    // Check if the specified user exists
    const otherUser = await User.findById(userId);
    if (!otherUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Find the conversation between these users
    const conversation = await Conversation.findOne({
      participants: { $all: [req.user._id, userId] }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'No conversation found with this user' });
    }

    const messages = await Message.find({
      conversation: conversation._id
    })
      .populate('sender', 'name profile.avatar')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Update read status for messages sent by other participant
    await Message.updateMany({
      conversation: conversation._id,
      sender: { $ne: req.user._id },
      read: false
    }, {
      read: true,
      readAt: new Date()
    });

    // Update conversation's last read time
    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessageAt: new Date()
    });

    // Count total messages
    const total = await Message.countDocuments({ conversation: conversation._id });

    res.json({
      success: true,
      data: messages.reverse(), // Reverse to show in chronological order
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
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

    if (!search) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // Find conversations where user is a participant and the other participant matches search
    const conversations = await Conversation.find({
      participants: req.user._id
    })
      .populate({
        path: 'participants',
        select: 'name profile.avatar'
      })
      .populate('service', 'name');

    // Filter conversations based on participant names or service name
    const filteredConversations = conversations.filter(conversation => {
      const otherParticipant = conversation.participants.find(p =>
        p._id.toString() !== req.user._id.toString()
      );

      return otherParticipant && (
        otherParticipant.name.toLowerCase().includes(search.toLowerCase()) ||
        (conversation.service && conversation.service.name.toLowerCase().includes(search.toLowerCase()))
      );
    });

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

    // Check if user is part of the conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    // Update or add read status for the current user
    const lastMessage = await Message.findOne({ conversation: conversationId })
      .sort({ createdAt: -1 });

    if (lastMessage) {
      const readStatusIndex = conversation.participantReadStatus.findIndex(status =>
        status.user.toString() === req.user._id.toString()
      );

      if (readStatusIndex !== -1) {
        // Update existing read status
        conversation.participantReadStatus[readStatusIndex].lastReadMessage = lastMessage._id;
        conversation.participantReadStatus[readStatusIndex].lastReadAt = new Date();
      } else {
        // Add new read status
        conversation.participantReadStatus.push({
          user: req.user._id,
          lastReadMessage: lastMessage._id,
          lastReadAt: new Date()
        });
      }

      await conversation.save();
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
    // Find all conversations where user is a participant
    const conversations = await Conversation.find({
      participants: req.user._id
    });

    let totalUnread = 0;

    for (const conversation of conversations) {
      // Get the read status for current user in this conversation
      const readStatus = conversation.participantReadStatus.find(status =>
        status.user.toString() === req.user._id.toString()
      );

      if (readStatus && readStatus.lastReadMessage) {
        // Count messages that were sent after user's last read message
        const unreadCount = await Message.countDocuments({
          conversation: conversation._id,
          createdAt: { $gt: readStatus.lastReadAt },
          sender: { $ne: req.user._id } // Only count messages from other users
        });
        totalUnread += unreadCount;
      } else {
        // If user has never read messages in this conversation, count all from others
        const unreadCount = await Message.countDocuments({
          conversation: conversation._id,
          sender: { $ne: req.user._id }
        });
        totalUnread += unreadCount;
      }
    }

    res.json({
      success: true,
      data: { unreadCount: totalUnread }
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};