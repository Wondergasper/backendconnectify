const { randomUUID } = require('crypto');
const { bookingRepository } = require('../repositories/supabase/bookingRepository');
const { availabilityRepository, normalizeDateString } = require('../repositories/supabase/availabilityRepository');
const { serviceRepository } = require('../repositories/supabase/serviceRepository');
const { userRepository } = require('../repositories/supabase/userRepository');
const { reviewRepository } = require('../repositories/supabase/reviewRepository');
const { conversationRepository } = require('../repositories/supabase');
const emailService = require('../services/emailService');
const notificationService = require('../services/notification/inappService');

const getId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

const isSameId = (left, right) => getId(left) === getId(right);

const canAccessBooking = (booking, user) => {
  if (!booking || !user) return false;
  if (user.role === 'admin') return true;
  return isSameId(booking.customer, user._id) || isSameId(booking.provider, user._id);
};

const canUpdateStatus = (booking, user, status) => {
  if (!booking || !user) return false;
  if (user.role === 'admin' || isSameId(booking.provider, user._id)) return true;
  return isSameId(booking.customer, user._id) && ['cancelled', 'rescheduled'].includes(status);
};

const normalizeBookingDate = (date) => normalizeDateString(date);

const notifyParticipants = async (req, booking, { title, message, status }) => {
  const io = req.app.get('io');
  const recipients = [booking.customer, booking.provider].map(getId).filter(Boolean);

  await Promise.allSettled(
    recipients.map(async (recipientId) => {
      const notification = await notificationService.sendInApp({
        userId: recipientId,
        title,
        body: message,
        type: 'booking',
        data: {
          bookingId: booking._id,
          status,
          serviceId: getId(booking.service),
          providerId: getId(booking.provider),
          customerId: getId(booking.customer)
        }
      });

      if (io) {
        io.to(`user_${recipientId}`).emit('newNotification', notification.notification);
        io.to(`notifications_${recipientId}`).emit('newNotification', notification.notification);
      }
    })
  );
};

const rollbackSlot = async ({ providerId, date, time, bookingId }) => {
  try {
    await availabilityRepository.unbookSlot({
      providerId,
      date,
      startTime: time,
      bookingId
    });
  } catch (error) {
    console.error('Booking slot rollback error:', error.message);
  }
};

const restoreSlot = async ({ providerId, date, time, bookingId }) => {
  try {
    await availabilityRepository.bookSlot({
      providerId,
      date,
      startTime: time,
      bookingId
    });
  } catch (error) {
    console.error('Booking slot restore error:', error.message);
  }
};

const incrementCompletedJobs = async (provider) => {
  const providerId = getId(provider);
  if (!providerId) return;

  const currentCount = Number(provider?.completedJobsCount || 0);
  await userRepository.updateProfile(providerId, {
    completed_jobs_count: currentCount + 1
  });
};

exports.createBooking = async (req, res) => {
  try {
    const { service: serviceId, date, time, duration, notes, address, providerId } = req.body;

    if (!serviceId || !date || !time) {
      return res.status(400).json({ error: 'Service, date, and time are required' });
    }

    const service = await serviceRepository.findById(serviceId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const resolvedProviderId = getId(service.provider) || providerId;
    if (!resolvedProviderId) {
      return res.status(400).json({ error: 'Service provider is required' });
    }

    const bookingDuration = Number(duration || service.duration || 0);
    if (!bookingDuration || bookingDuration <= 0) {
      return res.status(400).json({ error: 'Duration is required' });
    }

    const bookingAmount = Number(service.price ?? 0);
    if (Number.isNaN(bookingAmount) || bookingAmount < 0) {
      return res.status(400).json({ error: 'Service price is invalid' });
    }

    const bookingId = randomUUID();
    const bookingDate = normalizeBookingDate(date);

    const booking = await bookingRepository.createBookingAtomic({
      id: bookingId,
      customerId: req.user._id,
      providerId: resolvedProviderId,
      serviceId: service._id,
      date: bookingDate,
      time,
      duration: bookingDuration,
      totalAmount: bookingAmount,
      notes,
      address
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${resolvedProviderId}`).emit('newBookingRequest', {
        bookingId: booking._id,
        customerName: booking.customer?.name || req.user.name,
        service: booking.service?.name || service.name,
        date: booking.date,
        time: booking.time
      });
    }

    await notifyParticipants(req, booking, {
      title: 'New Booking',
      message: `Your booking for ${service.name} has been created.`,
      status: 'pending'
    });

    // Auto-create conversation between customer and provider
    try {
      const customerId = req.user._id;
      const existingConversation = await conversationRepository.findConversationBetweenUsers(
        customerId,
        resolvedProviderId,
        getId(service._id),
        booking._id
      );
      if (!existingConversation) {
        await conversationRepository.createConversation({
          participants: [customerId, resolvedProviderId],
          serviceId: getId(service._id),
          bookingId: booking._id
        });
      }
    } catch (convError) {
      console.error('Auto-create conversation error (non-fatal):', convError.message);
    }

    res.status(201).json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Create booking error:', error);
    const statusCode = error.statusCode || (error.message.includes('booked') || error.message.includes('required') ? 400 : 500);
    res.status(statusCode).json({ error: error.message || 'Server error' });
  }
};

exports.getUserBookings = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    const { data, pagination } = await bookingRepository.listUserBookings({
      userId: req.user._id,
      type: req.query.type,
      status: req.query.status,
      page,
      limit
    });

    res.json({
      success: true,
      data,
      pagination
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getBookingById = async (req, res) => {
  try {
    const booking = await bookingRepository.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (!canAccessBooking(booking, req.user)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateBookingStatus = async (req, res) => {
  try {
    const booking = await bookingRepository.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const nextStatus = req.body.status || booking.status;
    if (!canUpdateStatus(booking, req.user, nextStatus)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const nextDate = req.body.newDate || req.body.date || booking.date;
    const nextTime = req.body.newTime || req.body.time || booking.time;

    if (nextStatus === 'rescheduled' && (!req.body.newDate || !req.body.newTime)) {
      return res.status(400).json({ error: 'New date and time are required for rescheduling' });
    }

    const completedAt = nextStatus === 'completed'
      ? (req.body.completedAt ? new Date(req.body.completedAt).toISOString() : new Date().toISOString())
      : null;

    const updatedBooking = await bookingRepository.updateBookingStatusAtomic({
      bookingId: booking._id,
      userId: req.user._id,
      status: nextStatus,
      newDate: nextDate,
      newTime: nextTime,
      duration: req.body.duration,
      notes: req.body.notes,
      address: req.body.address,
      completedAt
    });

    const io = req.app.get('io');
    if (io) {
      const payload = {
        bookingId: updatedBooking._id,
        status: updatedBooking.status,
        message: `Booking status updated to ${updatedBooking.status}`
      };

      io.to(`user_${getId(updatedBooking.customer)}`).emit('bookingStatusChanged', payload);
      io.to(`user_${getId(updatedBooking.provider)}`).emit('bookingStatusChanged', payload);

      if (updatedBooking.status === 'completed') {
        const customerId = getId(updatedBooking.customer);
        io.to(`user_${customerId}`).emit('promptReview', {
          bookingId: updatedBooking._id,
          serviceId: getId(updatedBooking.service),
          providerId: getId(updatedBooking.provider)
        });
      }
    }

    await notifyParticipants(req, updatedBooking, {
      title: 'Booking Updated',
      message: `Booking status updated to ${updatedBooking.status}.`,
      status: updatedBooking.status
    });

    // For completed bookings, send a review prompt notification to the customer
    if (updatedBooking.status === 'completed') {
      const customerId = getId(updatedBooking.customer);
      if (customerId) {
        await notificationService.sendInApp({
          userId: customerId,
          title: 'Service Completed!',
          body: 'Your service is complete. Please leave a review for your provider.',
          type: 'review',
          data: {
            bookingId: updatedBooking._id,
            serviceId: getId(updatedBooking.service),
            action: 'leave_review'
          }
        }).catch(e => console.error('Review prompt notification error:', e.message));
      }
    }

    try {
      const customer = updatedBooking.customer;
      const provider = updatedBooking.provider;

      if (customer?.email) {
        await emailService.sendBookingStatusUpdate(
          updatedBooking,
          updatedBooking.status,
          customer.email,
          customer.name
        ).catch(() => null);
      }

      if (provider?.email) {
        await emailService.sendBookingStatusUpdate(
          updatedBooking,
          updatedBooking.status,
          provider.email,
          provider.name
        ).catch(() => null);
      }
    } catch (emailError) {
      console.error('Booking status email error:', emailError);
    }

    res.json({
      success: true,
      booking: updatedBooking
    });
  } catch (error) {
    console.error('Update booking status error:', error);
    const statusCode = error.statusCode || (error.message.includes('slot') || error.message.includes('required') ? 400 : 500);
    res.status(statusCode).json({ error: error.message || 'Server error' });
  }
};

exports.addRating = async (req, res) => {
  try {
    const { rating, comment, images = [] } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const review = await reviewRepository.createForCompletedBooking({
      bookingId: req.params.id,
      customerId: req.user._id,
      rating,
      comment,
      images
    });
    const booking = await bookingRepository.findById(req.params.id);

    const io = req.app.get('io');
    if (io && booking) {
      io.to(`user_${getId(booking.provider)}`).emit('newNotification', {
        title: 'New Review',
        message: `You received a ${rating}-star review.`,
        type: 'review',
        data: {
          bookingId: booking._id,
          serviceId: getId(booking.service)
        }
      });
    }

    res.status(201).json({
      success: true,
      review,
      booking
    });
  } catch (error) {
    console.error('Add rating error:', error);
    const message = error.message || 'Server error';
    const statusCode = message.includes('not found') ? 404 : message.includes('already reviewed') ? 400 : 500;
    res.status(statusCode).json({ error: message });
  }
};
