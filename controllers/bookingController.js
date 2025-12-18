const Booking = require('../models/Booking');
const User = require('../models/User');
const Service = require('../models/Service');
const Notification = require('../models/Notification');

// Create a new booking
exports.createBooking = async (req, res) => {
  try {
    const { service: serviceId, date, time, duration, notes, address, totalAmount } = req.body;

    // Validate service exists and is active
    const service = await Service.findById(serviceId);
    if (!service || !service.isActive) {
      return res.status(404).json({ error: 'Service not found or inactive' });
    }

    // Check if provider and customer are the same
    if (service.provider.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot book your own service' });
    }

    // Check if booking already exists at the same time
    const existingBooking = await Booking.findOne({
      provider: service.provider,
      date: new Date(date),
      time,
      status: { $in: ['pending', 'confirmed', 'in_progress'] }
    });

    if (existingBooking) {
      return res.status(400).json({ error: 'Provider is not available at this time' });
    }

    const booking = new Booking({
      customer: req.user._id,
      provider: service.provider,
      service: serviceId,
      date: new Date(date),
      time,
      duration,
      notes,
      address,
      totalAmount
    });

    await booking.save();

    // Populate the booking for response
    await booking.populate('service', 'name price provider');
    await booking.populate('customer', 'name profile.avatar');
    await booking.populate('provider', 'name profile.avatar');

    // Create notifications
    await Notification.create({
      user: service.provider,
      title: 'New Booking Request',
      message: `${booking.customer.name} wants to book your service "${service.name}" on ${date} at ${time}`,
      type: 'booking',
      data: {
        bookingId: booking._id,
        serviceId: service._id
      }
    });

    res.status(201).json({
      success: true,
      data: { booking }
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get bookings for current user
exports.getUserBookings = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const type = req.query.type; // 'customer' or 'provider'

    const query = {};
    
    if (type === 'provider') {
      query.provider = req.user._id;
    } else {
      query.customer = req.user._id;
    }

    if (status) {
      query.status = status;
    }

    const bookings = await Booking.find(query)
      .populate('service', 'name price images')
      .populate('customer', 'name profile.avatar')
      .populate('provider', 'name profile.avatar')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

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
    console.error('Get user bookings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get booking by ID
exports.getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('service', 'name price images')
      .populate('customer', 'name profile.avatar')
      .populate('provider', 'name profile.avatar');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if user is customer or provider for this booking
    if (
      booking.customer.toString() !== req.user._id.toString() &&
      booking.provider.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Get booking by ID error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update booking status
exports.updateBookingStatus = async (req, res) => {
  try {
    const { status, newDate, newTime } = req.body;
    const validStatuses = ['confirmed', 'in_progress', 'completed', 'cancelled', 'rejected'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if user is the provider or customer
    if (
      booking.provider.toString() !== req.user._id.toString() &&
      booking.customer.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Only provider can confirm/reject, only customer can cancel
    if (
      (status === 'confirmed' || status === 'rejected') &&
      booking.provider.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Only provider can update status to confirmed/rejected' });
    }

    if (
      status === 'cancelled' &&
      booking.customer.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Only customer can cancel booking' });
    }

    // If completed, check if it's the provider making the update
    if (status === 'completed' && booking.provider.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only provider can mark booking as completed' });
    }

    // Handle rescheduling if new date/time are provided
    if (newDate || newTime) {
      // Only customer can request rescheduling
      if (booking.customer.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Only customer can request rescheduling' });
      }

      // Check if booking is confirmed and not completed
      if (booking.status !== 'confirmed' || booking.status === 'completed') {
        return res.status(400).json({ error: 'Can only reschedule confirmed bookings' });
      }

      // Check if provider is available at new time
      const newBookingDate = newDate ? new Date(newDate) : booking.date;
      const newBookingTime = newTime || booking.time;

      const existingBooking = await Booking.findOne({
        provider: booking.provider,
        date: newBookingDate,
        time: newBookingTime,
        status: { $in: ['pending', 'confirmed', 'in_progress'] },
        _id: { $ne: booking._id } // Exclude current booking
      });

      if (existingBooking) {
        return res.status(400).json({ error: 'Provider is not available at this time' });
      }

      // Update booking date/time and set status to rescheduled
      booking.date = newBookingDate;
      booking.time = newBookingTime;
      booking.status = 'rescheduled'; // Add rescheduled status

      // Create notification for reschedule request
      await Notification.create({
        user: booking.provider,
        title: 'Reschedule Request',
        message: `${booking.customer.name} has requested to reschedule your booking for ${booking.service.name} to ${newBookingDate} at ${newBookingTime}`,
        type: 'booking',
        data: {
          bookingId: booking._id,
          serviceId: booking.service
        }
      });

      await booking.save();
      await booking.populate('service', 'name price images');
      await booking.populate('customer', 'name profile.avatar');
      await booking.populate('provider', 'name profile.avatar');

      res.json({
        success: true,
        booking
      });
      return;
    }

    // Update status
    booking.status = status;

    // If completed, set completion time
    if (status === 'completed') {
      booking.completedAt = new Date();
    }

    await booking.save();

    // Create notification based on status change
    let notificationTitle = '';
    let notificationMessage = '';
    let notificationType = 'booking';
    let recipient = booking.customer;

    switch (status) {
      case 'confirmed':
        notificationTitle = 'Booking Confirmed';
        notificationMessage = `Your booking for ${booking.service.name} has been confirmed.`;
        recipient = booking.customer;
        break;
      case 'rejected':
        notificationTitle = 'Booking Rejected';
        notificationMessage = `Your booking for ${booking.service.name} has been rejected.`;
        recipient = booking.customer;
        break;
      case 'in_progress':
        notificationTitle = 'Service In Progress';
        notificationMessage = `Your ${booking.service.name} service has started.`;
        recipient = booking.customer;
        break;
      case 'completed':
        notificationTitle = 'Service Completed';
        notificationMessage = `Your ${booking.service.name} service has been completed.`;
        recipient = booking.customer;
        break;
      case 'cancelled':
        notificationTitle = 'Booking Cancelled';
        notificationMessage = `Your booking for ${booking.service.name} has been cancelled.`;
        recipient = booking.provider;
        break;
      case 'rescheduled':
        notificationTitle = 'Booking Rescheduled';
        notificationMessage = `Your booking for ${booking.service.name} has been rescheduled to ${booking.date} at ${booking.time}.`;
        recipient = booking.provider;
        break;
    }

    await Notification.create({
      user: recipient,
      title: notificationTitle,
      message: notificationMessage,
      type: notificationType,
      data: {
        bookingId: booking._id,
        serviceId: booking.service
      }
    });

    await booking.populate('service', 'name price images');
    await booking.populate('customer', 'name profile.avatar');
    await booking.populate('provider', 'name profile.avatar');

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Add rating to booking
exports.addRating = async (req, res) => {
  try {
    const { rating, comment } = req.body;

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const booking = await Booking.findOne({
      _id: req.params.id,
      customer: req.user._id,
      status: 'completed'
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found or not completed' });
    }

    if (booking.rating.value) {
      return res.status(400).json({ error: 'Booking already rated' });
    }

    // Update booking with rating
    booking.rating = {
      value: rating,
      comment,
      date: new Date()
    };

    await booking.save();

    // Update provider's overall rating
    const provider = await User.findById(booking.provider);
    const service = await Service.findById(booking.service);

    // Calculate new average rating for provider
    const providerBookings = await Booking.find({
      provider: provider._id,
      'rating.value': { $exists: true, $ne: null }
    });

    const totalProviderRating = providerBookings.reduce((sum, b) => sum + b.rating.value, 0);
    const avgProviderRating = totalProviderRating / providerBookings.length;

    provider.rating = {
      average: avgProviderRating,
      count: providerBookings.length
    };

    await provider.save();

    // Update service's average rating
    const serviceBookings = await Booking.find({
      service: service._id,
      'rating.value': { $exists: true, $ne: null }
    });

    const totalServiceRating = serviceBookings.reduce((sum, b) => sum + b.rating.value, 0);
    const avgServiceRating = totalServiceRating / serviceBookings.length;

    service.rating = {
      average: avgServiceRating,
      count: serviceBookings.length
    };

    await service.save();

    await booking.populate('service', 'name price images');
    await booking.populate('customer', 'name profile.avatar');
    await booking.populate('provider', 'name profile.avatar');

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Add rating error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};