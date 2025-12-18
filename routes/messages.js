const express = require('express');
const {
  getConversations,
  getMessages,
  getRecentMessages,
  getLatestMessages,
  sendMessage,
  createConversation,
  getMessagesWithUser,
  searchConversations,
  markConversationAsRead,
  getUnreadCount
} = require('../controllers/messageController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET api/messages/conversations
// @desc    Get user conversations
// @access  Private
router.get('/conversations', auth, getConversations);

// @route   GET api/messages/conversations/:conversationId
// @desc    Get messages in a conversation
// @access  Private
router.get('/conversations/:conversationId', auth, getMessages);

// @route   GET api/messages/conversations/:conversationId/recent
// @desc    Get recent messages for real-time updates
// @access  Private
router.get('/conversations/:conversationId/recent', auth, getRecentMessages);

// @route   GET api/messages/conversations/:conversationId/latest
// @desc    Get latest messages for chat history
// @access  Private
router.get('/conversations/:conversationId/latest', auth, getLatestMessages);

// @route   GET api/messages/users/:userId
// @desc    Get messages with a specific user
// @access  Private
router.get('/users/:userId', auth, getMessagesWithUser);

// @route   GET api/messages/search
// @desc    Search conversations by participant name or service
// @access  Private
router.get('/search', auth, searchConversations);

// @route   GET api/messages/unread
// @desc    Get user's unread message count
// @access  Private
router.get('/unread', auth, getUnreadCount);

// @route   PUT api/messages/conversations/:conversationId/read
// @desc    Mark all messages in a conversation as read
// @access  Private
router.put('/conversations/:conversationId/read', auth, markConversationAsRead);

// @route   POST api/messages/conversations
// @desc    Create a new conversation
// @access  Private
router.post('/conversations', auth, createConversation);

// @route   POST api/messages
// @desc    Send a message
// @access  Private
router.post('/', auth, sendMessage);

module.exports = router;