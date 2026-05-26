const {
  availabilityRepository,
  generateDefaultSlots,
  generateDateRange
} = require('../repositories/supabase/availabilityRepository');

exports.getAvailability = async (req, res) => {
  try {
    const { providerId, date } = req.query;

    if (!providerId) {
      return res.status(400).json({ error: 'Provider ID is required' });
    }

    const availability = await availabilityRepository.getOrCreate({
      providerId,
      date: date || new Date()
    });

    res.json({
      success: true,
      data: availability
    });
  } catch (error) {
    console.error('Get availability error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getAvailabilityRange = async (req, res) => {
  try {
    const { providerId, startDate, endDate } = req.query;

    if (!providerId) {
      return res.status(400).json({ error: 'Provider ID is required' });
    }

    const availability = await availabilityRepository.listRange({
      providerId,
      startDate: startDate || new Date(),
      endDate: endDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    });

    res.json({
      success: true,
      data: availability
    });
  } catch (error) {
    console.error('Get availability range error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateAvailability = async (req, res) => {
  try {
    const { date, slots, isAvailable } = req.body;
    const providerId = req.user._id;

    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    const availability = await availabilityRepository.upsertAvailability({
      providerId,
      date,
      slots: slots || generateDefaultSlots(),
      isAvailable
    });

    res.json({
      success: true,
      data: availability
    });
  } catch (error) {
    console.error('Update availability error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.bookSlot = async (req, res) => {
  try {
    const { date, startTime, bookingId } = req.body;
    const providerId = req.user._id;

    if (!date || !startTime || !bookingId) {
      return res.status(400).json({ error: 'Date, start time, and booking ID are required' });
    }

    const availability = await availabilityRepository.bookSlot({
      providerId,
      date,
      startTime,
      bookingId
    });

    res.json({
      success: true,
      data: availability
    });
  } catch (error) {
    console.error('Book slot error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Server error' });
  }
};

exports.unbookSlot = async (req, res) => {
  try {
    const { date, startTime, bookingId } = req.body;
    const providerId = req.user._id;

    if (!date || !startTime || !bookingId) {
      return res.status(400).json({ error: 'Date, start time, and booking ID are required' });
    }

    const availability = await availabilityRepository.unbookSlot({
      providerId,
      date,
      startTime,
      bookingId
    });

    res.json({
      success: true,
      data: availability
    });
  } catch (error) {
    console.error('Unbook slot error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Server error' });
  }
};

exports.generateDefaultSlots = generateDefaultSlots;
exports.generateDateRange = generateDateRange;
