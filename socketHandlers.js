// socketHandlers.js
const jwt = require('jsonwebtoken');
const Message = require('./models/Message');
const Conversation = require('./models/Conversation');
const Booking = require('./models/Booking');
const User = require('./models/User');

module.exports = (io, socket) => {
  // Handle sending messages
  // NOTE: This handler is disabled because messages are now sent via HTTP API
  // The HTTP API controller will emit WebSocket events for real-time updates
  // This prevents duplicate message creation
  /*
  socket.on('sendMessage', async (data) => {
    try {
      const { conversationId, content, recipientId } = data;

      // Verify user has access to this conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.userId
      });

      if (!conversation) {
        socket.emit('error', { message: 'Conversation not found or access denied' });
        return;
      }

      // Create message
      const message = new Message({
        conversation: conversationId,
        sender: socket.userId,
        recipient: recipientId,
        content
      });

      await message.save();
      await message.populate('sender', 'name profile.avatar');

      // Update conversation with last message
      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: content,
        lastMessageAt: new Date()
      });

      // Send to sender and recipient
      io.to(`user_${socket.userId}`).emit('messageSent', message);
      io.to(`user_${recipientId}`).emit('newMessage', message);

      // Update conversation list for both users
      const updatedConversations = await Conversation.find({
        participants: { $in: [socket.userId, recipientId] }
      }).populate('participants', 'name profile.avatar');

      io.to(`user_${socket.userId}`).emit('conversationUpdated', updatedConversations);
      io.to(`user_${recipientId}`).emit('conversationUpdated', updatedConversations);

    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
  */

  // Handle booking status updates
  socket.on('bookingStatusUpdate', async (data) => {
    try {
      const { bookingId, status, providerId } = data;

      // Verify user has permission to update this booking
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        socket.emit('error', { message: 'Booking not found' });
        return;
      }

      // Update booking status
      await Booking.findByIdAndUpdate(bookingId, { status });

      // Notify customer about booking status change
      if (booking.customer.toString() !== socket.userId.toString()) {
        io.to(`user_${booking.customer}`).emit('bookingStatusChanged', {
          bookingId,
          status,
          message: `Your booking status has been updated to ${status}`
        });
      }

      // Notify provider about booking status change
      if (booking.provider.toString() !== socket.userId.toString()) {
        io.to(`user_${booking.provider}`).emit('bookingStatusChanged', {
          bookingId,
          status,
          message: `A booking status has been updated to ${status}`
        });
      }

    } catch (error) {
      console.error('Booking status update error:', error);
      socket.emit('error', { message: 'Failed to update booking status' });
    }
  });

  // Handle typing indicators
  socket.on('typingStart', async (data) => {
    try {
      const { conversationId } = data;

      // Verify user is part of this conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.userId
      });

      if (!conversation) {
        return;
      }

      // Broadcast to all users in the conversation except sender
      const otherParticipants = conversation.participants.filter(
        p => p.toString() !== socket.userId.toString()
      );

      otherParticipants.forEach(participantId => {
        io.to(`user_${participantId}`).emit('userTyping', {
          userId: socket.userId,
          conversationId
        });
      });
    } catch (error) {
      console.error('Typing start error:', error);
    }
  });

  socket.on('typingStop', async (data) => {
    try {
      const { conversationId } = data;

      // Verify user is part of this conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.userId
      });

      if (!conversation) {
        return;
      }

      // Broadcast to all users in the conversation except sender
      const otherParticipants = conversation.participants.filter(
        p => p.toString() !== socket.userId.toString()
      );

      otherParticipants.forEach(participantId => {
        io.to(`user_${participantId}`).emit('userStoppedTyping', {
          userId: socket.userId,
          conversationId
        });
      });
    } catch (error) {
      console.error('Typing stop error:', error);
    }
  });

  // Handle online status
  socket.on('setOnline', () => {
    socket.join('online_users');
    socket.broadcast.emit('userOnline', { userId: socket.userId });

    // Update user online status in database
    User.findByIdAndUpdate(
      socket.userId,
      { isActive: true, lastSeen: new Date() },
      { new: true }
    ).then(updatedUser => {
      io.emit('userStatusChanged', {
        userId: socket.userId,
        isActive: true
      });
    });
  });

  socket.on('setOffline', () => {
    socket.leave('online_users');
    socket.broadcast.emit('userOffline', { userId: socket.userId });

    // Update user offline status
    User.findByIdAndUpdate(
      socket.userId,
      { isActive: false, lastSeen: new Date() },
      { new: true }
    ).then(updatedUser => {
      io.emit('userStatusChanged', {
        userId: socket.userId,
        isActive: false
      });
    });
  });

  // Handle notifications
  socket.on('sendNotification', async (data) => {
    try {
      const { recipientId, type, title, message } = data;

      // In a real app, you'd save notification to database
      const notification = {
        type,
        title,
        message,
        createdAt: new Date(),
        read: false
      };

      // Send notification to recipient
      io.to(`user_${recipientId}`).emit('newNotification', notification);

    } catch (error) {
      console.error('Send notification error:', error);
      socket.emit('error', { message: 'Failed to send notification' });
    }
  });

  // Handle booking creation notifications
  socket.on('bookingCreated', async (booking) => {
    try {
      // Notify provider about new booking request
      io.to(`user_${booking.provider}`).emit('newBookingRequest', {
        bookingId: booking._id,
        customerName: booking.customer.name,
        service: booking.service.name,
        date: booking.date,
        time: booking.time
      });

      // Notify customer about booking confirmation (if auto-approved)
      io.to(`user_${booking.customer}`).emit('bookingConfirmed', {
        bookingId: booking._id,
        message: 'Your booking has been confirmed!'
      });

    } catch (error) {
      console.error('Booking created error:', error);
    }
  });

  // Handle real-time availability updates
  socket.on('availabilityUpdate', async (data) => {
    try {
      const { providerId, date, availability } = data;

      // Only providers can update their own availability
      if (providerId !== socket.userId) {
        socket.emit('error', { message: 'Unauthorized to update availability' });
        return;
      }

      // In a real app, you'd update availability in database
      // For now, broadcast the update
      io.emit('providerAvailabilityChanged', {
        providerId,
        date,
        availability
      });

    } catch (error) {
      console.error('Availability update error:', error);
      socket.emit('error', { message: 'Failed to update availability' });
    }
  });
};