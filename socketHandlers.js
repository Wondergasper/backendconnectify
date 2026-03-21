const Conversation = require('./models/Conversation');
const Booking = require('./models/Booking');
const notificationService = require('./services/notification/inappService');

const getId = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value._id) {
    return String(value._id);
  }

  return String(value);
};

const emitToUser = (io, userId, event, payload) => {
  if (!io || !userId) {
    return;
  }

  io.to(`user_${userId}`).emit(event, payload);
  io.to(`notifications_${userId}`).emit(event, payload);
};

module.exports = function registerSocketHandlers(io, socket) {
  const emitTyping = async (event, data) => {
    const { conversationId } = data || {};
    if (!conversationId) {
      return;
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: socket.userId
    }).select('participants');

    if (!conversation) {
      return;
    }

    const payload = {
      userId: socket.userId,
      conversationId
    };

    conversation.participants
      .map(getId)
      .filter((participantId) => participantId && participantId !== socket.userId)
      .forEach((participantId) => emitToUser(io, participantId, event, payload));
  };

  socket.on('typingStart', (data) => {
    emitTyping('userTyping', data).catch((error) => {
      console.error('typingStart error:', error);
    });
  });

  socket.on('typingStop', (data) => {
    emitTyping('userStoppedTyping', data).catch((error) => {
      console.error('typingStop error:', error);
    });
  });

  socket.on('joinConversation', async ({ conversationId }, ack) => {
    try {
      if (!conversationId) {
        if (ack) ack({ success: false, error: 'Conversation ID is required' });
        return;
      }

      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.userId
      }).select('_id');

      if (!conversation) {
        if (ack) ack({ success: false, error: 'Conversation not found or access denied' });
        return;
      }

      socket.join(`conversation_${conversationId}`);
      if (ack) ack({ success: true });
    } catch (error) {
      console.error('joinConversation error:', error);
      if (ack) ack({ success: false, error: 'Failed to join conversation' });
    }
  });

  socket.on('leaveConversation', ({ conversationId }) => {
    if (conversationId) {
      socket.leave(`conversation_${conversationId}`);
    }
  });

  socket.on('sendNotification', async (data, ack) => {
    try {
      const { recipientId, title, message, type = 'system', data: payloadData = {} } = data || {};

      if (!recipientId || !title || !message) {
        if (ack) ack({ success: false, error: 'recipientId, title, and message are required' });
        return;
      }

      const notification = await notificationService.sendInApp({
        userId: recipientId,
        title,
        body: message,
        type,
        data: payloadData
      });

      emitToUser(io, recipientId, 'newNotification', notification.notification);

      if (ack) ack({ success: true, notification: notification.notification });
    } catch (error) {
      console.error('sendNotification socket error:', error);
      if (ack) ack({ success: false, error: error.message });
    }
  });

  socket.on('bookingCreated', async (data, ack) => {
    try {
      const bookingId = getId(data?.bookingId || data?._id);
      const providerId = getId(data?.provider?._id || data?.provider || data?.providerId);

      if (!bookingId || !providerId) {
        if (ack) ack({ success: false, error: 'bookingId and providerId are required' });
        return;
      }

      emitToUser(io, providerId, 'newBookingRequest', {
        bookingId,
        customerName: data?.customer?.name || data?.customerName || 'Customer',
        service: data?.service?.name || data?.serviceName || 'Service',
        date: data?.date,
        time: data?.time
      });

      if (ack) ack({ success: true });
    } catch (error) {
      console.error('bookingCreated socket error:', error);
      if (ack) ack({ success: false, error: error.message });
    }
  });

  socket.on('bookingStatusUpdate', async (data, ack) => {
    try {
      const bookingId = getId(data?.bookingId || data?._id);
      if (!bookingId) {
        if (ack) ack({ success: false, error: 'bookingId is required' });
        return;
      }

      const booking = await Booking.findById(bookingId)
        .populate('customer', 'name email')
        .populate('provider', 'name email');

      if (!booking) {
        if (ack) ack({ success: false, error: 'Booking not found' });
        return;
      }

      const requesterId = socket.userId;
      const isParticipant =
        getId(booking.customer) === requesterId ||
        getId(booking.provider) === requesterId;

      if (!isParticipant && socket.userRole !== 'admin') {
        if (ack) ack({ success: false, error: 'Access denied' });
        return;
      }

      const payload = {
        bookingId: booking._id,
        status: data?.status || booking.status,
        message: data?.message || `Booking status updated to ${data?.status || booking.status}`
      };

      emitToUser(io, getId(booking.customer), 'bookingStatusChanged', payload);
      emitToUser(io, getId(booking.provider), 'bookingStatusChanged', payload);

      if (ack) ack({ success: true });
    } catch (error) {
      console.error('bookingStatusUpdate socket error:', error);
      if (ack) ack({ success: false, error: error.message });
    }
  });

  socket.on('availabilityUpdate', (data) => {
    const providerId = getId(data?.providerId);
    if (!providerId) {
      return;
    }

    emitToUser(io, providerId, 'providerAvailabilityChanged', {
      providerId,
      date: data?.date,
      availability: data?.availability
    });
  });

  socket.on('disconnect', () => {
    console.log(`User ${socket.userId} disconnected`);
  });
};
