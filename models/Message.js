const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true // Add index for efficient queries
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // Add index for efficient queries
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // Add index for efficient queries
  },
  content: {
    type: String,
    required: true,
    maxlength: [1000, 'Message cannot exceed 1000 characters'],
    trim: true // Trim whitespace
  },
  contentType: {
    type: String,
    enum: ['text', 'image', 'document', 'location'],
    default: 'text'
  },
  attachments: [{
    url: String,
    type: String, // image, document, etc.
    size: Number,
    name: String
  }],
  read: {
    type: Boolean,
    default: false,
    index: true // Add index for efficient queries
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  delivered: {
    type: Boolean,
    default: false,
    index: true
  },
  deliveredAt: Date,
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  repliedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: String,
    addedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Composite indexes for efficient queries
messageSchema.index({ conversation: 1, createdAt: -1 }); // For chronological ordering
messageSchema.index({ conversation: 1, read: 1 }); // For unread message queries
messageSchema.index({ sender: 1, createdAt: -1 }); // For user's sent messages
messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // TTL index: auto-delete messages after 90 days

module.exports = mongoose.model('Message', messageSchema);