const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Availability = require('../models/Availability');
const Review = require('../models/Review');
const Service = require('../models/Service');
const User = require('../models/User');
const emailService = require('../services/emailService');
const notificationService = require('../services/notification/inappService');

const generateDefaultSlots = () => {
  const slots = [];
  for (let hour = 8; hour < 20; hour++) {
    const startTime = `${String(hour).padStart(2, '0')}:00`;
    const endTime = `${String(hour + 1).padStart(2, '0')}:00`;
    slots.push({
      startTime,
      endTime,
      isBooked: false,
      bookingId: null
    });
  }
  return slots;
};

const normalizeDate = (date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

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

const isSameId = (left, right) => getId(left) === getId(right);

const canAccessBooking = (booking, user) => {
  if (!booking || !user) {
    return false;
  }

  if (user.role === 'admin') {
    return true;
  }

  return isSameId(booking.customer, user._id) || isSameId(booking.provider, user._id);
};

const canUpdateStatus = (booking, user, status) => {
  if (!booking || !user) {
    return false;
  }

  if (user.role === 'admin' || isSameId(booking.provider, user._id)) {
    return true;
  }

  if (isSameId(booking.customer, user._id) && ['cancelled', 'rescheduled'].includes(status)) {
    return true;
  }

  return false;
};

const getSlot = (availability, startTime) =>
  availability.slots.find((slot) => slot.startTime === startTime);

const bookSlot = async ({ providerId, date, startTime, bookingId, session }) => {
  const resolvedProviderId = getId(providerId);
  const queryDate = normalizeDate(date);
  let availability = await Availability.findOne({
    provider: resolvedProviderId,
    date: queryDate
  }).session(session);

  if (!availability) {
    availability = new Availability({
      provider: resolvedProviderId,
      date: queryDate,
      slots: generateDefaultSlots(),
      isAvailable: true
    });
  }

  const slot = getSlot(availability, startTime);
  if (!slot) {
    throw new Error('Time slot not found');
  }

  if (slot.isBooked) {
    throw new Error('Time slot is already booked');
  }

  slot.isBooked = true;
  slot.bookingId = bookingId;

  await availability.save({ session });
  return availability;
};

const unbookSlot = async ({ providerId, date, startTime, bookingId, session, strict = false }) => {
  const resolvedProviderId = getId(providerId);
  const queryDate = normalizeDate(date);
  const availability = await Availability.findOne({
    provider: resolvedProviderId,
    date: queryDate
  }).session(session);

  if (!availability) {
    if (strict) {
      throw new Error('Availability not found for this date');
    }
    return null;
  }

  const slot = availability.slots.find((item) => {
    if (item.startTime !== startTime) {
      return false;
    }

    if (!item.bookingId || !bookingId) {
      return true;
    }

    return String(item.bookingId) === String(bookingId);
  });

  if (!slot) {
    if (strict) {
      throw new Error('Time slot not found or does not match booking');
    }
    return null;
  }

  slot.isBooked = false;
  slot.bookingId = null;

  await availability.save({ session });
  return availability;
};

const populateBooking = (booking) =>
  booking.populate([
    { path: 'service', select: 'name price duration category images provider' },
    { path: 'customer', select: 'name profile.avatar role email' },
    { path: 'provider', select: 'name profile.avatar role email' }
  ]);

const notifyParticipants = async (req, booking, { title, message, status }) => {
  const io = req.app.get('io');
  const bookingData = booking.toObject ? booking.toObject() : booking;

  const recipients = [booking.customer, booking.provider]
    .map((recipient) => (recipient && recipient._id ? recipient._id : recipient))
    .filter(Boolean);

  await Promise.allSettled(
    recipients.map(async (recipientId) => {
      const notification = await notificationService.sendInApp({
        userId: String(recipientId),
        title,
        body: message,
        type: 'booking',
        data: {
          bookingId: bookingData._id,
          status,
          serviceId: bookingData.service?._id || bookingData.service,
          providerId: bookingData.provider?._id || bookingData.provider,
          customerId: bookingData.customer?._id || bookingData.customer
        }
      });

      if (io) {
        io.to(`user_${recipientId}`).emit('newNotification', notification.notification);
        io.to(`notifications_${recipientId}`).emit('newNotification', notification.notification);
      }
    })
  );
};

exports.createBooking = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { service: serviceId, date, time, duration, notes, address, providerId } = req.body;

    if (!serviceId || !date || !time) {
      return res.status(400).json({ error: 'Service, date, and time are required' });
    }

    const service = await Service.findById(serviceId).populate('provider', 'name profile.avatar role email');
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const resolvedProviderId = providerId || service.provider?._id || service.provider;
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

    const bookingDate = normalizeDate(date);

    let booking;
    let availability;

    await session.withTransaction(async () => {
      availability = await bookSlot({
        providerId: resolvedProviderId,
        date: bookingDate,
        startTime: time,
        bookingId: new mongoose.Types.ObjectId(),
        session
      });

      booking = await Booking.create([{
        customer: req.user._id,
        provider: resolvedProviderId,
        service: service._id,
        date: bookingDate,
        time,
        duration: bookingDuration,
        totalAmount: bookingAmount,
        notes,
        address,
        status: 'pending',
        paymentStatus: 'pending'
      }], { session }).then((docs) => docs[0]);

      const slot = getSlot(availability, time);
      if (slot) {
        slot.bookingId = booking._id;
      }
      await availability.save({ session });
    });

    const populatedBooking = await populateBooking(booking);

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${resolvedProviderId}`).emit('newBookingRequest', {
        bookingId: populatedBooking._id,
        customerName: populatedBooking.customer?.name || req.user.name,
        service: populatedBooking.service?.name || service.name,
        date: populatedBooking.date,
        time: populatedBooking.time
      });
    }

    await notifyParticipants(req, populatedBooking, {
      title: 'New Booking',
      message: `Your booking for ${service.name} has been created.`,
      status: 'pending'
    });

    res.status(201).json({
      success: true,
      booking: populatedBooking
    });
  } catch (error) {
    console.error('Create booking error:', error);
    const statusCode = error.message.includes('booked') || error.message.includes('required') ? 400 : 500;
    res.status(statusCode).json({ error: error.message || 'Server error' });
  } finally {
    session.endSession();
  }
};

exports.getUserBookings = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const type = req.query.type;
    const status = req.query.status;

    const query = {};

    if (type === 'provider') {
      query.provider = req.user._id;
    } else if (type === 'customer') {
      query.customer = req.user._id;
    } else {
      query.$or = [
        { customer: req.user._id },
        { provider: req.user._id }
      ];
    }

    if (status) {
      query.status = status;
    }

    const bookings = await Booking.find(query)
      .populate([
        { path: 'service', select: 'name price duration category images provider' },
        { path: 'customer', select: 'name profile.avatar role' },
        { path: 'provider', select: 'name profile.avatar role' }
      ])
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit);

    const total = await Booking.countDocuments(query);

    res.json({
      success: true,
      data: bookings,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate([
      { path: 'service', select: 'name price duration category images provider description' },
      { path: 'customer', select: 'name profile.avatar role email phone' },
      { path: 'provider', select: 'name profile.avatar role email phone' }
    ]);

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
  const session = await mongoose.startSession();

  try {
    const booking = await Booking.findById(req.params.id).session(session);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const previousStatus = booking.status;
    const nextStatus = req.body.status || booking.status;
    if (!canUpdateStatus(booking, req.user, nextStatus)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const previousDate = booking.date;
    const previousTime = booking.time;
    const nextDate = req.body.newDate || req.body.date || booking.date;
    const nextTime = req.body.newTime || req.body.time || booking.time;

    if (nextStatus === 'rescheduled' && (!req.body.newDate || !req.body.newTime)) {
      return res.status(400).json({ error: 'New date and time are required for rescheduling' });
    }

    await session.withTransaction(async () => {
      if (req.body.notes !== undefined) {
        booking.notes = req.body.notes;
      }

      if (req.body.address !== undefined) {
        booking.address = req.body.address;
      }

      if (req.body.duration !== undefined) {
        booking.duration = req.body.duration;
      }

      if (nextStatus === 'rescheduled') {
        await bookSlot({
          providerId: booking.provider,
          date: nextDate,
          startTime: nextTime,
          bookingId: booking._id,
          session
        });

        await unbookSlot({
          providerId: booking.provider,
          date: previousDate,
          startTime: previousTime,
          bookingId: booking._id,
          session
        });

        booking.date = normalizeDate(nextDate);
        booking.time = nextTime;
        booking.status = 'rescheduled';
      } else {
        if (nextStatus === 'cancelled' || nextStatus === 'rejected') {
          await unbookSlot({
            providerId: booking.provider,
            date: previousDate,
            startTime: previousTime,
            bookingId: booking._id,
            session
          });
        }

        booking.status = nextStatus;

        if ((req.body.date || req.body.newDate) && req.body.time) {
          booking.date = normalizeDate(nextDate);
          booking.time = nextTime;
        }
      }

      if (nextStatus === 'completed') {
        booking.completedAt = req.body.completedAt ? new Date(req.body.completedAt) : new Date();
      }

      await booking.save({ session });
    });

    const populatedBooking = await populateBooking(booking);
    const io = req.app.get('io');

    if (io) {
      const payload = {
        bookingId: populatedBooking._id,
        status: populatedBooking.status,
        message: `Booking status updated to ${populatedBooking.status}`
      };

      io.to(`user_${populatedBooking.customer?._id || populatedBooking.customer}`).emit('bookingStatusChanged', payload);
      io.to(`user_${populatedBooking.provider?._id || populatedBooking.provider}`).emit('bookingStatusChanged', payload);
    }

    await notifyParticipants(req, populatedBooking, {
      title: 'Booking Updated',
      message: `Booking status updated to ${populatedBooking.status}.`,
      status: populatedBooking.status
    });

    if (previousStatus !== 'completed' && populatedBooking.status === 'completed') {
      await User.findByIdAndUpdate(populatedBooking.provider?._id || populatedBooking.provider, {
        $inc: { completedJobsCount: 1 }
      });
    }

    try {
      const customer = populatedBooking.customer;
      const provider = populatedBooking.provider;
      const bookingService = populatedBooking.service;

      if (customer?.email) {
        await emailService.sendBookingStatusUpdate(
          populatedBooking,
          populatedBooking.status,
          customer.email,
          customer.name
        ).catch(() => null);
      }

      if (provider?.email) {
        await emailService.sendBookingStatusUpdate(
          populatedBooking,
          populatedBooking.status,
          provider.email,
          provider.name
        ).catch(() => null);
      }
    } catch (emailError) {
      console.error('Booking status email error:', emailError);
    }

    res.json({
      success: true,
      booking: populatedBooking
    });
  } catch (error) {
    console.error('Update booking status error:', error);
    const statusCode = error.message.includes('slot') || error.message.includes('required') ? 400 : 500;
    res.status(statusCode).json({ error: error.message || 'Server error' });
  } finally {
    session.endSession();
  }
};

exports.addRating = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { rating, comment, images = [] } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const booking = await Booking.findOne({
      _id: req.params.id,
      customer: req.user._id,
      status: 'completed'
    }).populate([
      { path: 'provider', select: 'name profile.avatar email' },
      { path: 'service', select: 'name' }
    ]).session(session);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found or not completed' });
    }

    if (booking.rating?.value) {
      return res.status(400).json({ error: 'You have already reviewed this booking' });
    }

    let review;

    await session.withTransaction(async () => {
      review = await Review.create([{
        customer: req.user._id,
        provider: booking.provider._id || booking.provider,
        booking: booking._id,
        service: booking.service._id || booking.service,
        rating,
        comment,
        images
      }], { session }).then((docs) => docs[0]);

      booking.rating = {
        value: rating,
        comment,
        date: new Date()
      };
      await booking.save({ session });
    });

    const providerReviews = await Review.find({ provider: booking.provider._id || booking.provider });
    const serviceReviews = await Review.find({ service: booking.service._id || booking.service });

    const providerAverage = providerReviews.length
      ? providerReviews.reduce((sum, item) => sum + item.rating, 0) / providerReviews.length
      : 0;
    const serviceAverage = serviceReviews.length
      ? serviceReviews.reduce((sum, item) => sum + item.rating, 0) / serviceReviews.length
      : 0;

    await User.findByIdAndUpdate(booking.provider._id || booking.provider, {
      rating: {
        average: providerAverage,
        count: providerReviews.length
      }
    });

    await Service.findByIdAndUpdate(booking.service._id || booking.service, {
      rating: {
        average: serviceAverage,
        count: serviceReviews.length
      }
    });

    const populatedReview = await review.populate([
      { path: 'customer', select: 'name profile.avatar' },
      { path: 'provider', select: 'name profile.avatar' },
      { path: 'service', select: 'name' }
    ]);

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.provider._id || booking.provider}`).emit('newNotification', {
        title: 'New Review',
        message: `You received a ${rating}-star review.`,
        type: 'review',
        data: {
          bookingId: booking._id,
          serviceId: booking.service._id || booking.service
        }
      });
    }

    res.status(201).json({
      success: true,
      review: populatedReview,
      booking
    });
  } catch (error) {
    console.error('Add rating error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    session.endSession();
  }
};
