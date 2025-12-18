const mongoose = require('mongoose');

const participantReadStatusSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // Add index for efficient queries
  },
  lastReadMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastReadAt: {
    type: Date,
    default: Date.now
  },
  unreadCount: {
    type: Number,
    default: 0
  }
});

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // Add index for efficient queries
  }],
  participantReadStatus: [participantReadStatusSchema],
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    index: true // Add index for efficient queries
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    index: true // Add index for efficient queries
  },
  name: {
    type: String,
    trim: true
  },
  isArchived: {
    type: Boolean,
    default: false,
    index: true // Add index for efficient queries
  },
  isPinned: {
    type: Boolean,
    default: false,
    index: true // Add index for efficient queries
  },
  unreadCount: {
    type: Number,
    default: 0
  },
  type: {
    type: String,
    enum: ['direct', 'group'],
    default: 'direct'
  },
  membersCount: {
    type: Number,
    default: 2
  },
  lastMessage: {
    content: String,
    type: String, // text, image, etc.
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: Date
  },
  lastMessageAt: {
    type: Date,
    default: Date.now,
    index: true // Add index for efficient sorting
  },
  isGroup: {
    type: Boolean,
    default: false
  },
  groupInfo: {
    name: String,
    avatar: String,
    description: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    isPublic: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

// Composite indexes for efficient queries
conversationSchema.index({ participants: 1, createdAt: -1 }); // For user's conversation list
conversationSchema.index({ service: 1 }); // For service-based conversations
conversationSchema.index({ booking: 1 }); // For booking-based conversations
conversationSchema.index({ 'participantReadStatus.user': 1 }); // For user's unread messages
conversationSchema.index({ lastMessageAt: -1 }); // For sorting conversations by last activity

module.exports = mongoose.model('Conversation', conversationSchema);